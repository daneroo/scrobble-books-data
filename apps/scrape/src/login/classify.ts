/** What a page shows. */
export type PageState =
  | "signed-in"
  | "signed-out"
  | "redirect"
  | "waf-challenge"
  | "captcha"
  | "device-verification"
  | "bad-credentials"
  | "sign-in-form"
  | "unknown";

/** A loaded page, as seen by the browser or a fetch. */
export interface PageView {
  url: string;
  /** HTTP status, when known (a browser page after a navigation may not have one). */
  status?: number;
  html: string;
}

/** Names the state a page is in, from its URL, status and markup. */
export function classifyPage(page: PageView): PageState {
  const { status, html } = page;
  if (status !== undefined && status >= 300 && status < 400) return "redirect";
  if (status === 202 || isWafChallenge(html)) return "waf-challenge";
  if (isCaptcha(html)) return "captcha";
  if (isDeviceVerification(page)) return "device-verification";
  if (html.includes("auth-error-message-box")) return "bad-credentials";
  if (html.includes("ap_email") || html.includes("ap_password"))
    return "sign-in-form";
  if (html.includes(":signed_in'")) return "signed-in";
  if (html.includes(":signed_out'")) return "signed-out";
  return "unknown";
}

// The AWS WAF JavaScript challenge page loads challenge.js from a
// *.token.awswaf.com host and sets these globals.
function isWafChallenge(html: string): boolean {
  return (
    html.includes("awsWafCookieDomainList") ||
    html.includes("gokuProps") ||
    /\.awswaf\.com\/[^"']*challenge\.js/.test(html)
  );
}

// Amazon sign-in captchas: the image captcha on the sign-in form, and the
// "solve this puzzle" challenge.
function isCaptcha(html: string): boolean {
  return (
    html.includes("auth-captcha-image") ||
    html.includes("auth-captcha-guess") ||
    html.includes("captchacharacters") ||
    html.includes("aamation")
  );
}

// Amazon's "verify it's you" pages (a code sent by email or text, or a
// notification to approve) and two-step verification.
function isDeviceVerification({ url, html }: PageView): boolean {
  const path = new URL(url).pathname;
  return (
    path.startsWith("/ap/cvf") ||
    path.startsWith("/ap/mfa") ||
    html.includes("cvf-page-content") ||
    html.includes("auth-mfa-otpcode")
  );
}
