/**
 * `bun run login`: opens a visible browser on `secrets/browser-profile/` at
 * the Goodreads home page and leaves it to the user (to look, or to sign out
 * and in by hand). When the user closes the browser window, checks whether
 * the saved profile is signed in, prints "signed in" or "signed out", and
 * exits. No scraping: `bun run scrape` uses the saved profile.
 */
import { login } from "./login/login.ts";
import { report } from "./report.ts";

console.log(
  "login: a browser window opens at the Goodreads home page; close it when done",
);
const result = await login();
if (result.ok) {
  console.log("signed in");
} else if (result.failure.mode === "signed-out") {
  console.log("signed out");
} else {
  // the check could not tell (e.g. a WAF challenge that did not clear)
  const { lines, exitCode } = report(result, { user: "" });
  for (const line of lines) console.error(line);
  process.exitCode = exitCode;
}
