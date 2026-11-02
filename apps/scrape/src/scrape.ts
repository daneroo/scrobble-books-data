/**
 * The scraper's single entry point: `bun run scrape`. See HELP below.
 *
 * It logs in once, fetches every list page through the flow controller,
 * checks completeness, and writes `goodreads.json` (list-page fields) plus
 * one segment per list page, all checked by CUE. Any failure fails closed.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ScrapeFailure, type Failure } from "./failure.ts";
import { createFlow, formatEvent, type Flow } from "./flow/flow.ts";
import { flowSettings } from "./flow/settings.ts";
import { login } from "./login/login.ts";
import { signedInSource } from "./pages/source.ts";
import { redactor, report, type Outcome, type Secrets } from "./report.ts";
import { failureOf, runScrape } from "./run.ts";

const ROOT = join(import.meta.dir, "../../..");
/** The published file, at the repo root. */
const PUBLISH_PATH = join(ROOT, "goodreads.json");
/** Segments, raw pages and the staged output (gitignored). */
const DATA_DIR = join(ROOT, "data/scrape");
/** Per list page, body included (T2). */
const LIST_PAGE_TIMEOUT_MS = 30_000;
/** For the whole run (T3). */
const RUN_DEADLINE_MS = 30 * 60_000;

const HELP = `Usage: bun run scrape [options]

Logs in to Goodreads once, fetches every list page (all shelves, 100 books a
page), checks that every book is there exactly once, and writes:

  goodreads.json          the list-page fields of every book (repo root)
  data/scrape/segments/   one file per list page, in the same schema
  data/scrape/pages/      the raw list pages, as fetched

CUE checks goodreads.json and every segment before goodreads.json is written.
Any failure is named, exits 1, and leaves goodreads.json as it was.

Options:
  -c, --concurrency N  Requests in flight at most; 1 is strictly sequential.
                       Default 2.
  --rate R|none        The maximum number of requests started per second
                       (e.g. 2, or 0.5 for one every 2 s), or "none" for no
                       cap. Default 2.
  --interactive        Open a visible browser and sign in by hand, including
                       any "verify it's you" step. Use it the first time, and
                       whenever a headless login is blocked.
  -h, --help           Show this help.

Login: a still-valid saved session (secrets/browser-profile, gitignored) is
reused, with no login at all. Otherwise it signs in headless with the
credentials, once; it never retries a login.

Credentials are read from secrets/GITHUB.env: GOODREADS_USER (always), and
GOODREADS_USERNAME (the email) and GOODREADS_PASSWORD (headless login only).
`;

const secrets: Secrets = {
  email: process.env.GOODREADS_USERNAME ?? "",
  password: process.env.GOODREADS_PASSWORD ?? "",
  user: process.env.GOODREADS_USER ?? "",
};

const outcome = await main(process.argv.slice(2));
if (outcome !== "help") {
  const { lines, exitCode } = report(outcome, secrets);
  for (const line of lines)
    (exitCode === 0 ? console.log : console.error)(line);
  process.exitCode = exitCode;
}

async function main(args: string[]): Promise<Outcome | "help"> {
  let interactive: boolean;
  let flow: Flow;
  const deadline = new AbortController();
  // every log line is redacted (X4); the cookie is added once there is one
  let redact = redactor(secrets);
  try {
    const { values } = parseArgs({
      args,
      options: {
        interactive: { type: "boolean" },
        concurrency: { type: "string", short: "c" },
        rate: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values.help) {
      console.log(HELP);
      return "help";
    }
    interactive = values.interactive ?? false;
    flow = createFlow(flowSettings(args), {
      signal: deadline.signal,
      onEvent: (event) => console.log(redact(formatEvent(event))),
    });
  } catch (error) {
    return fail({
      step: "setup",
      mode: "bad-config",
      detail: `${error instanceof Error ? error.message : String(error)}; see --help`,
    });
  }

  const missing = Object.entries(
    interactive
      ? { GOODREADS_USER: secrets.user }
      : {
          GOODREADS_USERNAME: secrets.email,
          GOODREADS_PASSWORD: secrets.password,
          GOODREADS_USER: secrets.user,
        },
  )
    .filter(([, value]) => value === "")
    .map(([name]) => name);
  if (missing.length > 0) {
    return fail({
      step: "setup",
      mode: "missing-credentials",
      detail: `unset: ${missing.join(", ")}`,
    });
  }

  const timer = setTimeout(() => {
    deadline.abort(
      new ScrapeFailure({
        step: "list-pages",
        mode: "run-timeout",
        detail: `the run passed its ${RUN_DEADLINE_MS / 60_000} min deadline`,
      }),
    );
  }, RUN_DEADLINE_MS);
  try {
    let cookie: string;
    let userAgent: string;
    try {
      const result = await login(
        { email: secrets.email, password: secrets.password },
        { interactive },
      );
      if (!result.ok) return fail(result.failure);
      ({ cookie, userAgent } = result);
      redact = redactor(secrets, cookie);
    } catch (error) {
      return fail(failureOf(error, "login"));
    }

    const source = signedInSource({
      cookie,
      userAgent,
      timeoutMs: LIST_PAGE_TIMEOUT_MS,
      step: "list-pages",
    });
    const outcome = await runScrape({
      user: secrets.user,
      source,
      flow,
      dataDir: DATA_DIR,
      publishPath: PUBLISH_PATH,
      signal: deadline.signal,
      log: (line) => console.log(redact(line)),
    });
    return { ...outcome, cookie };
  } finally {
    clearTimeout(timer);
  }
}

function fail(failure: Failure): Outcome {
  return { ok: false, failure };
}
