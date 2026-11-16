/**
 * `bun run login`: opens a visible browser on `secrets/browser-profile/` at
 * the Goodreads home page and leaves it to the user (to look, or to sign out
 * and in by hand). When the user closes the browser window, checks whether
 * the saved profile is signed in, prints "signed in" or "signed out", and
 * exits. No scraping: `bun run scrape` uses the saved profile. `--help`
 * prints help and opens no browser.
 */
import { parseCommand, type Command } from "./cli.ts";
import { login as openLogin, type SessionResult } from "./login/login.ts";
import { printToConsole, type Print } from "./logs.ts";
import { report } from "./report.ts";

/** `bun run login`, for `--help`. */
export const LOGIN: Command = {
  name: "bun run login",
  description:
    "Opens a visible browser on secrets/browser-profile/ (gitignored) at the Goodreads home page, and leaves it to you: sign in or out by hand. When you close the window, it prints whether the saved profile is signed in. bun run scrape uses that profile; it never signs in.",
  options: {},
};

/** What the command runs on; tests replace each one. */
export interface LoginDeps {
  /** Opens the browser, waits for the user to close it, checks the session. */
  login?: () => Promise<SessionResult>;
  print?: Print;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), {});
}

/** Runs `bun run login` with `args`; resolves with the exit code. */
export async function main(args: string[], deps: LoginDeps): Promise<number> {
  const { login = openLogin, print = printToConsole } = deps;
  const parsed = await parseCommand(LOGIN, args);
  if (parsed.kind === "help") {
    print(parsed.text, "out");
    return 0;
  }
  if (parsed.kind === "error") {
    print(`login: ${parsed.message}; see --help`, "err");
    return 1;
  }
  print(
    "login: a browser window opens at the Goodreads home page; close it when done",
    "out",
  );
  const result = await login();
  if (result.ok) {
    print("signed in", "out");
    return 0;
  }
  if (result.failure.mode === "signed-out") {
    print("signed out", "out");
    return 0;
  }
  // the check could not tell (e.g. a WAF challenge that did not clear)
  const { lines, exitCode } = report(result, { user: "" });
  for (const line of lines) print(line, "err");
  return exitCode;
}
