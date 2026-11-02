import { chromium, type Page } from "playwright";

import { classifyPage, type PageState } from "./classify.ts";
import { failureModeFor, type Failure } from "./failure.ts";

export interface Credentials {
  email: string;
  password: string;
}

/** Credentials in; either a session cookie, or a named failure. */
export type LoginResult =
  { ok: true; cookie: string } | { ok: false; failure: Failure };

const SIGN_IN_URL = "https://www.goodreads.com/user/sign_in";
const COOKIE_URL = "https://www.goodreads.com/";
/** How long to wait for each page or element. */
const ELEMENT_TIMEOUT_MS = 20_000;
/** How long to wait, after submitting, for a signed-in or signed-out page. */
const SETTLE_TIMEOUT_MS = 30_000;
const POLL_MS = 500;

/**
 * Logs in to Goodreads through its Amazon sign-in, in a fresh headless
 * browser.
 *
 * After submitting, it waits for the real page's signed-in or signed-out
 * marker: an AWS WAF JavaScript challenge page can come first and clears on
 * its own.
 */
export async function login(credentials: Credentials): Promise<LoginResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    // Headless Chromium says "HeadlessChrome" in its user agent; present as
    // the same Chrome, headed.
    const probe = await browser.newPage();
    const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace(
      "HeadlessChrome",
      "Chrome",
    );
    await probe.close();
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();
    page.setDefaultTimeout(ELEMENT_TIMEOUT_MS);

    await page.goto(SIGN_IN_URL, { waitUntil: "load" });

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
    const cookies = await context.cookies(COOKIE_URL);
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    return { ok: true, cookie };
  } finally {
    await browser.close();
  }
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
