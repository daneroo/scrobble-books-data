import type { PageState } from "./classify.ts";

/** Where a login test run failed. */
export type Step = "setup" | "login" | "list-page";

/**
 * Named failure modes. Each one ends the run with a non-zero exit.
 *
 * - `missing-credentials`: an env var is unset.
 * - `bad-credentials`: Amazon sign-in rejected the email or password.
 * - `captcha`: a captcha (image or puzzle) was shown.
 * - `device-verification`: a "verify it's you" code, approval or two-step page.
 * - `waf-challenge`: an AWS WAF challenge did not clear (or a 202 on fetch).
 * - `layout-change`: an expected form or button, or any known marker, was not
 *   found.
 * - `signed-out`: a Goodreads page loaded, but signed out.
 * - `redirect-to-sign-in`: the list page answered with a redirect.
 * - `http-error`: the list page answered with another non-200 status.
 * - `error`: anything unexpected (browser launch, network, timeout).
 */
export type FailureMode =
  | "missing-credentials"
  | "bad-credentials"
  | "captcha"
  | "device-verification"
  | "waf-challenge"
  | "layout-change"
  | "signed-out"
  | "redirect-to-sign-in"
  | "http-error"
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
