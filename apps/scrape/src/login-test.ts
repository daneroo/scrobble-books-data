/**
 * Login test: log in headless, then fetch one signed-in list page with the
 * session cookie. Writes nothing. Exits 0 on a signed-in 200 page, 1 on any
 * named failure.
 *
 * Env: GOODREADS_USERNAME (the email), GOODREADS_PASSWORD, GOODREADS_USER
 * (the numeric user id in list URLs).
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

const outcome = await run(secrets);
const { lines, exitCode } = report(outcome, secrets);
for (const line of lines) (exitCode === 0 ? console.log : console.error)(line);
process.exit(exitCode);

async function run({ email, password, user }: Secrets): Promise<Outcome> {
  const missing = Object.entries({
    GOODREADS_USERNAME: email,
    GOODREADS_PASSWORD: password,
    GOODREADS_USER: user,
  })
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
    const result = await login({ email, password });
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
