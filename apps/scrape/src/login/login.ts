import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import { classifyPage, type PageState } from "./classify.ts";
import { failureModeFor, type Failure } from "../failure.ts";

/**
 * Either a session cookie and the browser's User-Agent (to send with it,
 * P7), or a named failure.
 */
export type SessionResult =
  | { ok: true; cookie: string; userAgent: string }
  | { ok: false; failure: Failure };

const GOODREADS = "https://www.goodreads.com";
/** How long to wait for each page or element. */
const ELEMENT_TIMEOUT_MS = 20_000;
/** How long to wait for a signed-in or signed-out page (past a WAF challenge). */
const SETTLE_TIMEOUT_MS = 30_000;
const POLL_MS = 500;

/**
 * The saved browser profile (gitignored, under `secrets/`), written by
 * `bun run login`. Amazon remembers a device by it, so reusing it avoids
 * "verify it's you" on every sign-in.
 */
export const PROFILE_DIR = join(
  import.meta.dir,
  "../../../../secrets/browser-profile",
);

/** Where the profile is, and which Goodreads to ask (a fake one in tests). */
export interface ProfileOptions {
  profileDir?: string;
  origin?: string;
}

/**
 * `bun run login`: a visible browser on the profile, at the Goodreads home
 * page, left to the user (to look, or to sign out and in by hand). When the
 * user has closed every window, the profile is saved, then checked with
 * `savedSession`.
 */
export async function login({
  profileDir = PROFILE_DIR,
  origin = GOODREADS,
}: ProfileOptions = {}): Promise<SessionResult> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
  });
  try {
    const closed = allWindowsClosed(context);
    const page = await firstPage(context);
    // a failed load shows in the window; the user decides what to do
    page.goto(`${origin}/`).catch(() => undefined);
    await closed;
  } finally {
    await context.close();
  }
  return await savedSession({ profileDir, origin });
}

/** Resolves once the browser has no window left. */
function allWindowsClosed(context: BrowserContext): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (context.pages().length === 0) resolve();
    };
    context.on("page", (page) => page.on("close", check));
    for (const page of context.pages()) page.on("close", check);
    context.on("close", () => resolve());
  });
}

/**
 * For `bun run scrape`: the saved session, read in a headless browser on the
 * profile. It never signs in: signed out, it fails as `signed-out`, saying to
 * run `bun run login`.
 */
export async function savedSession({
  profileDir = PROFILE_DIR,
  origin = GOODREADS,
}: ProfileOptions = {}): Promise<SessionResult> {
  // Headless Chromium says "HeadlessChrome" in its user agent; present as
  // the same Chrome, headed.
  const userAgent = await headedUserAgent();
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    userAgent,
  });
  try {
    const page = await firstPage(context);
    await page.goto(`${origin}/`, { waitUntil: "load" });
    const state = await settle(page);
    if (state === "signed-out")
      return failure(page, "signed-out", "run bun run login");
    if (state !== "signed-in") {
      return failure(
        page,
        failureModeFor(state),
        `the home page is ${state}, not signed in`,
      );
    }
    const cookies = await context.cookies(`${origin}/`);
    return {
      ok: true,
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      userAgent: await page.evaluate(() => navigator.userAgent),
    };
  } finally {
    await context.close();
  }
}

async function firstPage(context: BrowserContext): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(ELEMENT_TIMEOUT_MS);
  return page;
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

/** Waits briefly past a WAF challenge for the signed-in or signed-out marker. */
async function settle(page: Page): Promise<PageState> {
  return await waitFor(page, ["signed-in", "signed-out"], SETTLE_TIMEOUT_MS);
}

/** Polls the page until it is in one of `states`, or time runs out. */
async function waitFor(
  page: Page,
  states: readonly PageState[],
  timeoutMs: number,
): Promise<PageState> {
  const deadline = Date.now() + timeoutMs;
  let state: PageState = "unknown";
  while (Date.now() < deadline) {
    state = await stateOf(page);
    if (states.includes(state)) return state;
    await page.waitForTimeout(POLL_MS);
  }
  return state;
}

function failure(
  page: Page,
  mode: Failure["mode"],
  detail: string,
): { ok: false; failure: Failure } {
  return {
    ok: false,
    failure: { step: "login", mode, detail, url: page.url() },
  };
}

async function stateOf(page: Page): Promise<PageState> {
  try {
    return classifyPage({ url: page.url(), html: await page.content() });
  } catch {
    // content() throws while the page is navigating
    return "unknown";
  }
}
