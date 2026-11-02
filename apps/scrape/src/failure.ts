import type { PageState } from "./login/classify.ts";

/** Where a run failed. */
export type Step =
  | "setup"
  | "login"
  | "list-pages"
  | "review-pages"
  | "book-pages"
  | "checks"
  | "outputs";

/**
 * Named failure modes. Each one ends the run with a non-zero exit, and no
 * published file is written.
 *
 * Setup and login:
 * - `missing-credentials`: an env var is unset.
 * - `bad-config`: a malformed option (X7).
 * - `bad-credentials`: Amazon sign-in rejected the email or password.
 * - `captcha`: a captcha (image or puzzle) was shown.
 * - `device-verification`: a "verify it's you" code, approval or two-step page.
 *
 * A page that isn't a signed-in 200:
 * - `waf-challenge`: an AWS WAF challenge did not clear (or a 202 on fetch).
 * - `redirect-to-sign-in`: the page answered with a redirect.
 * - `signed-out`: a Goodreads page loaded, but signed out.
 * - `http-error`: another status that isn't retried (a 4xx).
 * - `layout-change`: an expected form, button, page part or marker is missing.
 *
 * Temporary errors, after the last attempt (R2, X1):
 * - `timeout`: no full response in time.
 * - `network-error`: the connection failed (reset, DNS).
 * - `server-error`: a 5xx.
 * - `too-many-requests`: a 429.
 * - `throttled`: Goodreads asked for a wait over 60 s, or the run spent its
 *   retry budget (R4, R5).
 *
 * Parsing and checks:
 * - `parse-failure`: a row failed its zod schema (S1).
 * - `page-limit`: the sidebar asks for more than the 400-page ceiling.
 * - `empty-run`: the sidebar counts no books (C5).
 * - `page-size`: a page other than the last has not exactly 100 rows (C2).
 * - `count-mismatch`: unique books per exclusive shelf differ from the
 *   sidebar, or the sidebar changed during the run (C3).
 * - `duplicate-book`: a book is listed twice (C3).
 * - `shelf-mismatch`: a review page's exclusive shelf differs from the list
 *   page's.
 * - `unexpected-shrink`: a book of the reference copy is not on the list
 *   (C6, until cutover).
 *
 * The run:
 * - `cue-failure`: CUE rejected a segment or `goodreads.json` (X5).
 * - `run-timeout`: the run passed its 30 min deadline (T3).
 * - `error`: anything unexpected (browser launch, a bug).
 */
export type FailureMode =
  | "missing-credentials"
  | "bad-config"
  | "bad-credentials"
  | "captcha"
  | "device-verification"
  | "waf-challenge"
  | "redirect-to-sign-in"
  | "signed-out"
  | "http-error"
  | "layout-change"
  | "timeout"
  | "network-error"
  | "server-error"
  | "too-many-requests"
  | "throttled"
  | "parse-failure"
  | "page-limit"
  | "empty-run"
  | "page-size"
  | "count-mismatch"
  | "duplicate-book"
  | "shelf-mismatch"
  | "unexpected-shrink"
  | "cue-failure"
  | "run-timeout"
  | "error";

export interface Failure {
  step: Step;
  mode: FailureMode;
  /** What was seen, in a few words. */
  detail: string;
  /** The page the failure was seen on. */
  url?: string;
  status?: number;
}

/** A named failure, thrown; it ends the run. */
export class ScrapeFailure extends Error implements Failure {
  override name = "ScrapeFailure";
  readonly step: Step;
  readonly mode: FailureMode;
  readonly detail: string;
  readonly url?: string;
  readonly status?: number;
  /** The body of the page it was seen on, kept for debugging (X3). */
  readonly body?: string;

  constructor(
    { step, mode, detail, url, status }: Failure,
    { body }: { body?: string } = {},
  ) {
    super(`${step} ${mode}: ${detail}`);
    this.body = body;
    this.step = step;
    this.mode = mode;
    this.detail = detail;
    this.url = url;
    this.status = status;
  }

  /** The plain failure, for the report. */
  get failure(): Failure {
    const { step, mode, detail, url, status } = this;
    return { step, mode, detail, url, status };
  }
}

/** The failure a page in this state stands for (the one shared mapping). */
export function failureModeFor(state: PageState): FailureMode {
  switch (state) {
    case "waf-challenge":
    case "captcha":
    case "device-verification":
    case "bad-credentials":
    case "signed-out":
      return state;
    case "redirect":
      return "redirect-to-sign-in";
    default:
      // signed-in where it shouldn't matter, still on the form, or a page
      // with no known marker
      return "layout-change";
  }
}
