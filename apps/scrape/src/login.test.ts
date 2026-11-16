/**
 * The entry point, `bun run login`: its options, and what it prints. The
 * browser is a stub: no test opens one.
 */
import { describe, expect, test } from "bun:test";

import type { SessionResult } from "./login/login.ts";
import { main } from "./login.ts";

async function login(args: string[], result?: SessionResult) {
  const lines: string[] = [];
  let browsers = 0;
  const code = await main(args, {
    login: async () => {
      browsers++;
      return result ?? { ok: true, cookie: "c=1", userAgent: "UA" };
    },
    print: (line) => lines.push(line),
  });
  return { code, text: lines.join("\n"), browsers };
}

describe("bun run login", () => {
  test("--help prints generated help and opens no browser", async () => {
    const { code, text, browsers } = await login(["--help"]);
    expect(code).toBe(0);
    expect(text).toStartWith("bun run login [options]");
    expect(text).toContain("-h, --help");
    expect(text).toContain("secrets/browser-profile/");
    expect(browsers).toBe(0);
  });

  test("an unknown option fails, exit 1, and opens no browser", async () => {
    const { code, text, browsers } = await login(["--bogus"]);
    expect(code).toBe(1);
    expect(text).toContain("Unknown argument: bogus");
    expect(browsers).toBe(0);
  });

  test("with no option, opens the browser and says whether it is signed in", async () => {
    const signedIn = await login([]);
    expect(signedIn.browsers).toBe(1);
    expect(signedIn.text).toEndWith("signed in");
    const signedOut = await login([], {
      ok: false,
      failure: { step: "login", mode: "signed-out", detail: "x" },
    });
    expect(signedOut.code).toBe(0);
    expect(signedOut.text).toEndWith("signed out");
  });
});
