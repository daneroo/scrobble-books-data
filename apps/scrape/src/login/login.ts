import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import { classifyPage, type PageState } from "./classify.ts";
import { failureModeFor, type Failure } from "../failure.ts";

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Credentials in; either a session cookie and the browser's User-Agent (to
 * send with it, P7), or a named failure.
 */
export type LoginResult =
  | { ok: true; cookie: string; userAgent: string }
  | { ok: false; failure: Failure };

const SIGN_IN_URL = "https://www.goodreads.com/user/sign_in";
const COOKIE_URL = "https://www.goodreads.com/";
/** How long to wait for each page or element. */
const ELEMENT_TIMEOUT_MS = 20_000;
/** How long to wait, after submitting, for a signed-in or signed-out page. */
const SETTLE_TIMEOUT_MS = 30_000;
const POLL_MS = 500;

/**
 * The saved browser profile (gitignored, under `secrets/`). Amazon remembers
 * a device by it, so reusing it avoids "verify it's you" on every login, and
 * a still-valid session needs no login at all.
 */
const PROFILE_DIR = join(
  import.meta.dir,
  "../../../../secrets/browser-profile",
);
/** How long to wait for the user to sign in by hand. */
const INTERACTIVE_TIMEOUT_MS = 10 * 60_000;

export interface LoginOptions {
  /** Open a visible browser and wait for the user to sign in by hand. */
  interactive?: boolean;
}

/**
 * Logs in to Goodreads in a browser that keeps its profile between runs.
 *
 * 1. Interactive: a visible browser opens and always waits for the user to
 *    sign in by hand (including any "verify it's you" step). A saved
 *    session is signed out first, with the page's own "Sign out" link.
 *    Nothing is fetched until the user has signed in.
 * 2. Headless: if the saved session is still signed in, it is reused: no
 *    login.
 * 3. Otherwise: a headless sign-in through Amazon with the credentials. After
 *    submitting, it waits for the real page's signed-in or signed-out marker:
 *    an AWS WAF JavaScript challenge page can come first and clears on its own.
 */
export async function login(
  credentials: Credentials,
  { interactive = false }: LoginOptions = {},
): Promise<LoginResult> {
  // Headless Chromium says "HeadlessChrome" in its user agent; present as
  // the same Chrome, headed.
  const userAgent = interactive ? undefined : await headedUserAgent();
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !interactive,
    userAgent,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(ELEMENT_TIMEOUT_MS);

    await page.goto(COOKIE_URL, { waitUntil: "load" });
    const saved = await settleReuse(page);
    if (saved === "signed-in" && !interactive) {
      console.log("login: reusing the saved session");
      return await signedIn(context, page);
    }
    if (saved === "signed-in") {
      // interactive: the user signs in by hand, every time
      const state = await signOut(page);
      if (state !== "signed-out") {
        return failure(
          page,
          "layout-change",
          `could not sign out of the saved session first (page is ${state})`,
        );
      }
      console.log("login: signed out of the saved session");
    }

    await page.goto(SIGN_IN_URL, { waitUntil: "load" });

    if (interactive) {
      console.log(
        "login: sign in in the browser window (you have 10 minutes); it closes by itself when done",
      );
      const state = await waitForSignIn(page);
      if (state !== "signed-in") {
        return failure(
          page,
          "error",
          `not signed in after 10 minutes (page is ${state})`,
        );
      }
      return await signedIn(context, page);
    }

    // The home-page check can fail to tell (e.g. right after a WAF challenge)
    // while the saved session is valid: the sign-in page then shows signed in.
    // Untested: login has no test seam (it would need a fake Goodreads served
    // inside the browser). Checked by hand only, 2026-11-03: with a valid
    // session, the sign-in URL redirects to the home page, classified
    // signed-in. Proof in a real run: the log line below.
    if ((await stateOf(page)) === "signed-in") {
      console.log(
        "login: reusing the saved session (signed in on the sign-in page)",
      );
      return await signedIn(context, page);
    }

    // Goodreads offers several sign-in choices; email goes to Amazon sign-in.
    if (!(await attempt(() => page.click('a:has-text("Sign in with email")'))))
      return await missing(page, "no 'Sign in with email' link");
    if (!(await attempt(() => page.fill("#ap_email", credentials.email))))
      return await missing(page, "no email field");
    // Amazon sometimes asks for the email first, then the password.
    if (!(await page.locator("#ap_password").isVisible())) {
      if (!(await attempt(() => page.click("#continue"))))
        return await missing(page, "no password field and no continue button");
    }
    if (!(await attempt(() => page.fill("#ap_password", credentials.password))))
      return await missing(page, "no password field");
    if (!(await attempt(() => page.click("#signInSubmit"))))
      return await missing(page, "no sign-in button");

    const state = await settle(page);
    if (state !== "signed-in") {
      return failure(
        page,
        failureModeFor(state),
        `after sign-in, the page is ${state}`,
      );
    }
    return await signedIn(context, page);
  } finally {
    await context.close();
  }
}

/** The headless browser's user agent, with "HeadlessChrome" made "Chrome". */
async function headedUserAgent(): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const probe = await browser.newPage();
    const agent = await probe.evaluate(() => navigator.userAgent);
    return agent.replace("HeadlessChrome", "Chrome");
  } finally {
    await browser.close();
  }
}

/** The session: the cookie, and the User-Agent the browser sent with it. */
async function signedIn(
  context: BrowserContext,
  page: Page,
): Promise<LoginResult> {
  const userAgent = await page.evaluate(() => navigator.userAgent);
  return { ok: true, cookie: await cookieOf(context), userAgent };
}

/** The Goodreads cookies as one `Cookie` header value. */
async function cookieOf(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies(COOKIE_URL);
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * On the home page, waits briefly past a WAF challenge for the signed-in or
 * signed-out marker.
 */
async function settleReuse(page: Page): Promise<PageState> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let state: PageState = "unknown";
  while (Date.now() < deadline) {
    state = await stateOf(page);
    if (state === "signed-in" || state === "signed-out") return state;
    await page.waitForTimeout(POLL_MS);
  }
  return state;
}

/**
 * Clicks the page's own "Sign out" link (Goodreads sends it as a POST), then
 * waits for a signed-out page.
 */
async function signOut(page: Page): Promise<PageState> {
  const link = page.locator('a[href^="/user/sign_out"]').first();
  // the link sits in a closed menu: click it from the page, as a user would
  if (!(await attempt(() => link.dispatchEvent("click"))))
    return await stateOf(page);
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let state: PageState = "unknown";
  while (Date.now() < deadline) {
    state = await stateOf(page);
    if (state === "signed-out") return state;
    await page.waitForTimeout(POLL_MS);
  }
  return state;
}

/** Waits for the user to finish signing in by hand. */
async function waitForSignIn(page: Page): Promise<PageState> {
  const deadline = Date.now() + INTERACTIVE_TIMEOUT_MS;
  let state: PageState = "unknown";
  while (Date.now() < deadline) {
    state = await stateOf(page);
    if (state === "signed-in") return state;
    await page.waitForTimeout(POLL_MS);
  }
  return state;
}

/** Runs one Playwright action; false if it timed out or found nothing. */
async function attempt(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
    return true;
  } catch {
    return false;
  }
}

/**
 * An expected element was missing: name the failure from what the page
 * shows. Before submitting, a signed-out page is just the sign-in page, so
 * the element missing from it is a layout change.
 */
async function missing(page: Page, detail: string): Promise<LoginResult> {
  const state = await stateOf(page);
  const mode =
    state === "signed-out" || state === "bad-credentials"
      ? "layout-change"
      : failureModeFor(state);
  return failure(page, mode, `${detail} (page is ${state})`);
}

function failure(
  page: Page,
  mode: Failure["mode"],
  detail: string,
): LoginResult {
  return {
    ok: false,
    failure: { step: "login", mode, detail, url: page.url() },
  };
}

/**
 * After submitting, polls the page until it shows the signed-in or
 * signed-out marker, or a failure that won't go away (captcha, verification,
 * bad credentials), or time runs out. A WAF challenge, the sign-in form, and
 * pages in between keep it waiting.
 */
async function settle(page: Page): Promise<PageState> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let state: PageState = "unknown";
  while (Date.now() < deadline) {
    state = await stateOf(page);
    if (FINAL.has(state)) return state;
    await page.waitForTimeout(POLL_MS);
  }
  return state;
}

const FINAL: ReadonlySet<PageState> = new Set([
  "signed-in",
  "signed-out",
  "captcha",
  "device-verification",
  "bad-credentials",
]);

async function stateOf(page: Page): Promise<PageState> {
  try {
    return classifyPage({ url: page.url(), html: await page.content() });
  } catch {
    // content() throws while the page is navigating
    return "unknown";
  }
}
