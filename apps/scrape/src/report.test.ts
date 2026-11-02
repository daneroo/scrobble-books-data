import { describe, expect, test } from "bun:test";

import { redactor, report } from "./report.ts";

const secrets = {
  email: "reader@example.com",
  password: "hunter2-correct-horse",
  user: "12345678",
};
const cookie =
  "session-id=147-8833201-5521342; at-main=Atza|IwEBIExampleTokenValue; locale=en";

describe("report", () => {
  test("a run that wrote its outputs passes with exit 0", () => {
    const { lines, exitCode } = report(
      { ok: true, cookie, books: 1450, pages: 15, published: "goodreads.json" },
      secrets,
    );
    expect(exitCode).toBe(0);
    expect(lines.join("\n")).toContain("PASS");
    expect(lines.join("\n")).toContain("1450 books from 15 list pages");
  });

  test.each([
    ["login", "bad-credentials"],
    ["login", "captcha"],
    ["login", "device-verification"],
    ["login", "waf-challenge"],
    ["login", "layout-change"],
    ["list-pages", "redirect-to-sign-in"],
    ["list-pages", "signed-out"],
    ["checks", "count-mismatch"],
    ["outputs", "cue-failure"],
  ] as const)(
    "a %s failure %s fails with its name and exit 1",
    (step, mode) => {
      const { lines, exitCode } = report(
        {
          ok: false,
          failure: {
            step,
            mode,
            detail: "what was seen",
            url: "https://www.goodreads.com/ap/signin",
          },
        },
        secrets,
      );
      expect(exitCode).toBe(1);
      expect(lines.join("\n")).toContain(`FAIL: ${step} ${mode}`);
      expect(lines.join("\n")).toContain("what was seen");
    },
  );

  test("the email, password, user id, cookie and cookie values never appear", () => {
    const { lines } = report(
      {
        ok: false,
        cookie,
        failure: {
          step: "list-pages",
          mode: "error",
          detail: `fetch failed for reader@example.com with hunter2-correct-horse, sent ${cookie}, then Atza|IwEBIExampleTokenValue and 147-8833201-5521342`,
          url: "https://www.goodreads.com/review/list/12345678",
        },
      },
      secrets,
    );
    const text = lines.join("\n");
    for (const value of [
      secrets.email,
      secrets.password,
      secrets.user,
      cookie,
      "Atza|IwEBIExampleTokenValue",
      "147-8833201-5521342",
    ]) {
      expect(text).not.toContain(value);
    }
    expect(text).toContain("[redacted]");
  });

  test("URL-encoded secrets never appear either", () => {
    const { lines } = report(
      {
        ok: false,
        failure: {
          step: "login",
          mode: "error",
          detail:
            "POST email=reader%40example.com&password=hunter2-correct-horse failed",
        },
      },
      { ...secrets, password: "p@ss word&more" },
    );
    const text = lines.join("\n");
    expect(text).not.toContain("reader%40example.com");
    const { lines: lines2 } = report(
      {
        ok: false,
        failure: {
          step: "login",
          mode: "error",
          detail: "pw=p%40ss%20word%26more",
        },
      },
      { ...secrets, password: "p@ss word&more" },
    );
    expect(lines2.join("\n")).not.toContain("p%40ss%20word%26more");
  });

  test("redaction leaves short cookie values alone, so the log stays readable", () => {
    const { lines } = report(
      { ok: true, cookie, books: 1450, pages: 15, published: "goodreads.json" },
      secrets,
    );
    // `locale=en` must not turn every "en" into [redacted]; a passing run
    // has nothing secret to hide.
    expect(lines.join("\n")).not.toContain("[redacted]");
  });

  test("a URL is logged without its query string", () => {
    const { lines } = report(
      {
        ok: false,
        failure: {
          step: "login",
          mode: "device-verification",
          detail: "verification page",
          url: "https://www.goodreads.com/ap/cvf/request?arb=0a1b2c3d&language=en",
        },
      },
      secrets,
    );
    const text = lines.join("\n");
    expect(text).toContain("https://www.goodreads.com/ap/cvf/request");
    expect(text).not.toContain("arb=");
  });

  test("the redactor hides the user id in any log line, e.g. a retry", () => {
    const redact = redactor(secrets, cookie);
    const line = redact(
      "list pages 2-15: retry list page 15 after attempt 1/4 (/review/list/12345678 page 15: no response in 30s), waiting 1.8s",
    );
    expect(line).not.toContain(secrets.user);
    expect(line).toContain("/review/list/[redacted] page 15");
  });
});
