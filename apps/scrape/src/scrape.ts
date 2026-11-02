/**
 * The scraper's single entry point: `bun run scrape`. See HELP below.
 *
 * For now it logs in, then fetches one signed-in list page and checks it.
 * The full scrape (all list pages to goodreads.json) comes in #29.
 */
import { classifyPage } from "./login/classify.ts";
import { failureModeFor, type Failure } from "./login/failure.ts";
import { login } from "./login/login.ts";
import { report, type Outcome, type Secrets } from "./login/report.ts";

const FETCH_TIMEOUT_MS = 30_000;

const secrets: Secrets = {
  email: process.env.GOODREADS_USERNAME ?? "",
  password: process.env.GOODREADS_PASSWORD ?? "",
  user: process.env.GOODREADS_USER ?? "",
};

const HELP = `Usage: bun run scrape [--interactive] [--help]

Scrapes Goodreads. For now it only logs in and checks one signed-in list
page; the full scrape comes in #29. Writes nothing except the saved browser
profile in secrets/browser-profile (gitignored).

Login: a still-valid saved session is reused, with no login at all.
Otherwise it signs in headless with the credentials.

Options:
  --interactive  Open a visible browser and sign in by hand, including any
                 "verify it's you" step. Use it the first time, and whenever
                 a headless login is blocked.
  --help         Show this help.

Credentials are read from secrets/GITHUB.env: GOODREADS_USER (always), and
GOODREADS_USERNAME (the email) and GOODREADS_PASSWORD (headless login only).
`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
const unknown = args.filter((arg) => arg !== "--interactive");
if (unknown.length > 0) {
  console.error(`unknown option: ${unknown.join(" ")}\n\n${HELP}`);
  process.exit(1);
}
const interactive = args.includes("--interactive");

const outcome = await run(secrets);
const { lines, exitCode } = report(outcome, secrets);
for (const line of lines) (exitCode === 0 ? console.log : console.error)(line);
process.exit(exitCode);

async function run({ email, password, user }: Secrets): Promise<Outcome> {
  const required = interactive
    ? { GOODREADS_USER: user }
    : {
        GOODREADS_USERNAME: email,
        GOODREADS_PASSWORD: password,
        GOODREADS_USER: user,
      };
  const missing = Object.entries(required)
    .filter(([, value]) => value === "")
    .map(([name]) => name);
  if (missing.length > 0) {
    return fail({
      step: "setup",
      mode: "missing-credentials",
      detail: `unset: ${missing.join(", ")}`,
    });
  }

  const start = Date.now();
  let cookie: string;
  try {
    const result = await login({ email, password }, { interactive });
    if (!result.ok) return fail(result.failure);
    cookie = result.cookie;
  } catch (error) {
    return fail({ step: "login", mode: "error", detail: firstLine(error) });
  }
  const loginMs = Date.now() - start;

  const url = `https://www.goodreads.com/review/list/${user}?shelf=%23ALL%23&per_page=100&sort=date_added&order=d&page=1`;
  try {
    const response = await fetch(url, {
      headers: { Cookie: cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const html = await response.text();
    const { status } = response;
    const state = classifyPage({ url, status, html });
    if (status === 200 && state === "signed-in") {
      const bytes = new TextEncoder().encode(html).length;
      return { ok: true, cookie, loginMs, listPage: { status, bytes } };
    }
    const mode =
      state === "unknown" && status !== 200
        ? "http-error"
        : failureModeFor(state);
    const location = response.headers.get("location");
    const detail =
      `list page is ${state}, status ${status}` +
      (location === null ? "" : `, redirected to ${location}`);
    return fail({ step: "list-page", mode, detail, url, status }, cookie);
  } catch (error) {
    return fail(
      { step: "list-page", mode: "error", detail: firstLine(error) },
      cookie,
    );
  }
}

function fail(failure: Failure, cookie?: string): Outcome {
  return { ok: false, cookie, failure };
}

// Playwright errors carry a long call log; the first line names the problem.
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0] ?? "";
}
