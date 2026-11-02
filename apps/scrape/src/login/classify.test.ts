import { describe, expect, test } from "bun:test";

import { classifyPage } from "./classify.ts";

// Goodreads pages tag themselves in an inline script, e.g.
// window.ue.tag('review:list:signed_in', ue.main_scope);
const goodreads = (tag: string) =>
  `<html><head><script>if (window.ue && window.ue.tag) { window.ue.tag('${tag}', ue.main_scope);window.ue.tag('${tag}:desktop', ue.main_scope); }</script></head><body></body></html>`;

describe("classifyPage", () => {
  test("a Goodreads page tagged signed_in is signed-in", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/",
        status: 200,
        html: goodreads("home:index:signed_in"),
      }),
    ).toBe("signed-in");
  });

  test("a book page whose embedded page data says signedIn is signed-in", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/book/show/6617037-debt",
        status: 200,
        html: `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"authContextParams":{"signedIn":true,"role":"user"}}}}</script>`,
      }),
    ).toBe("signed-in");
  });

  test("a Goodreads page tagged signed_out is signed-out", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/",
        status: 200,
        html: goodreads("home:index:signed_out"),
      }),
    ).toBe("signed-out");
  });

  // AWS WAF's JavaScript challenge interstitial (the fetch sees a 202 with
  // x-amzn-waf-action: challenge; the browser just sees the page).
  const wafChallenge = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title></title><script>window.awsWafCookieDomainList = [];window.gokuProps = {"key":"AQIDAHj...","iv":"A6we...","context":"6ZB..."};</script><script src="https://3e3378af7cd0.0f2e8e1b.us-east-1.token.awswaf.com/3e3378af7cd0/challenge.js"></script></head><body><div id="challenge-container"></div><noscript><h1>JavaScript is disabled</h1></noscript></body></html>`;

  test("an AWS WAF challenge page in the browser is waf-challenge", () => {
    expect(
      classifyPage({ url: "https://www.goodreads.com/", html: wafChallenge }),
    ).toBe("waf-challenge");
  });

  test("a 202 response is waf-challenge, whatever its body", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/book/show/1",
        status: 202,
        html: "",
      }),
    ).toBe("waf-challenge");
  });

  // Amazon sign-in (Goodreads serves it under /ap/signin). These snippets
  // follow Amazon's sign-in markup; they are not saved Goodreads pages.
  const signIn = "https://www.goodreads.com/ap/signin";
  const form = `<form name="signIn" method="post"><input type="email" id="ap_email" name="email"><input type="password" id="ap_password" name="password"><input id="signInSubmit" type="submit"></form>`;

  test("a sign-in page with an image captcha is captcha", () => {
    expect(
      classifyPage({
        url: signIn,
        html: `<div id="auth-warning-message-box"><h4>Important Message!</h4><p>Enter the characters as they are shown in the image.</p></div><img id="auth-captcha-image" src="https://opfcaptcha-prod.s3.amazonaws.com/x.jpg"><input id="auth-captcha-guess" name="guess">${form}`,
      }),
    ).toBe("captcha");
  });

  test("an Amazon verification page (code sent by email) is device-verification", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/ap/cvf/request?arb=abc",
        html: `<div id="cvf-page-content"><h1>Verify it's you</h1><p>To continue, enter the code we sent to your email.</p><input name="code"></div>`,
      }),
    ).toBe("device-verification");
  });

  test("an Amazon two-step verification page is device-verification", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/ap/mfa?arb=abc",
        html: `<form id="auth-mfa-form"><input id="auth-mfa-otpcode" name="otpCode"></form>`,
      }),
    ).toBe("device-verification");
  });

  test("a sign-in page with an error message is bad-credentials", () => {
    expect(
      classifyPage({
        url: signIn,
        html: `<div id="auth-error-message-box" class="a-box a-alert a-alert-error"><h4 class="a-alert-heading">There was a problem</h4><ul><li><span>Your password is incorrect</span></li></ul></div>${form}`,
      }),
    ).toBe("bad-credentials");
  });

  test("a sign-in page with only the form is sign-in-form", () => {
    expect(classifyPage({ url: signIn, html: form })).toBe("sign-in-form");
  });

  test("a 3xx response is redirect (a signed-out list page goes to sign-in)", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/review/list/1",
        status: 302,
        html: '<html><body>You are being <a href="https://www.goodreads.com/user/sign_in">redirected</a>.</body></html>',
      }),
    ).toBe("redirect");
  });

  test("a page with no known marker is unknown", () => {
    expect(
      classifyPage({
        url: "https://www.goodreads.com/",
        status: 200,
        html: "<html><body>Something new</body></html>",
      }),
    ).toBe("unknown");
  });
});
