/**
 * The scraper's single entry point: `bun run scrape`. See HELP below.
 *
 * It logs in once, fetches every list page through the flow controller,
 * checks completeness, fetches every book's review page (exclusive shelf and
 * reading timeline) and checks its shelf, fetches every book page
 * (description and author), and writes `goodreads.json` plus
 * `goodreads-rss.json` (its compatibility mapping) and one segment per list
 * page, all checked by CUE. Any failure fails closed.
 * With `--cached`, a page saved by an earlier run is read, not fetched.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ScrapeFailure, type Failure } from "./failure.ts";
import { createFlow, formatEvent, type Flow } from "./flow/flow.ts";
import { flowSettings } from "./flow/settings.ts";
import { REFERENCE_PATH } from "./compat/reference.ts";
import { LIMITS } from "./limits.ts";
import { login } from "./login/login.ts";
import { signedInSource } from "./pages/source.ts";
import { redactor, report, type Outcome, type Secrets } from "./report.ts";
import { failureOf, runScrape } from "./run.ts";

const ROOT = join(import.meta.dir, "../../..");
/** The published file, at the repo root. */
const PUBLISH_PATH = join(ROOT, "goodreads.json");
/** Segments, raw pages and the staged output (gitignored). */
const DATA_DIR = join(ROOT, "data/scrape");
const {
  listPageTimeoutMs: LIST_PAGE_TIMEOUT_MS,
  reviewPageTimeoutMs: REVIEW_PAGE_TIMEOUT_MS,
  bookPageTimeoutMs: BOOK_PAGE_TIMEOUT_MS,
  runDeadlineMs: RUN_DEADLINE_MS,
} = LIMITS;

const HELP = `Usage: bun run scrape [options]

Logs in to Goodreads once, fetches every list page (all shelves, 100 books a
page), checks that every book is there exactly once, then fetches every
book's review page and checks that its shelf equals the list page's, then
every book's page (description and author). Until cutover, every book of the
reference copy (goodreads-rss-ng-2026-10-27T15.37Z.json) is checked against
the list; a reference bookId not on it is reported, with its title, under
"changed bookIds" (C6). Writes:

  goodreads.json          every book: its list-page fields and its reading
                          timeline, as shown (repo root)
  goodreads-rss.json      the compatibility file, mapped from goodreads.json
                          in the old RSS formats (repo root)
  data/scrape/segments/   one file per list page, in the same schema
  data/scrape/pages/      the raw list, review and book pages, as fetched

CUE checks both files and every segment before either file is written. Any
failure is named, exits 1, and leaves both files as they were.

Options:
  --cached             A read-through cache of the raw pages: a page already
                       in data/scrape/pages/ is read from there, any other
                       is fetched and saved there. Without it, that folder
                       is cleared and every page is fetched. No expiry: to
                       refresh, run without --cached. Login is as usual.
                       A saved page is read at once, with no wait under the
                       rate cap: --rate applies to fetched pages only.
  -c, --concurrency N  Requests in flight at most; 1 is strictly sequential.
                       Default ${LIMITS.concurrency}.
  --rate R|none        The maximum number of requests started per second
                       (e.g. 2, or 0.5 for one every 2 s), or "none" for no
                       cap. Default ${LIMITS.ratePerSecond}.
  --interactive        Open a visible browser and sign in by hand, including
                       any "verify it's you" step: it always waits for you,
                       signing a saved session out first, and fetches
                       nothing until you have signed in. Use it the first
                       time, and whenever a headless login is blocked.
  -h, --help           Show this help.

Login: without --interactive, a still-valid saved session
(secrets/browser-profile, gitignored) is reused, with no login at all. Otherwise it signs in headless with the
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
  let cached: boolean;
  let flow: Flow;
  const deadline = new AbortController();
  // every log line is redacted (X4); the cookie is added once there is one
  let redact = redactor(secrets);
  try {
    const { values } = parseArgs({
      args,
      options: {
        interactive: { type: "boolean" },
        cached: { type: "boolean" },
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
    cached = values.cached ?? false;
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

    const sources = {
      list: signedInSource({
        cookie,
        userAgent,
        timeoutMs: LIST_PAGE_TIMEOUT_MS,
        step: "list-pages",
      }),
      review: signedInSource({
        cookie,
        userAgent,
        timeoutMs: REVIEW_PAGE_TIMEOUT_MS,
        step: "review-pages",
      }),
      book: signedInSource({
        cookie,
        userAgent,
        timeoutMs: BOOK_PAGE_TIMEOUT_MS,
        step: "book-pages",
      }),
    };
    const outcome = await runScrape({
      user: secrets.user,
      sources,
      cached,
      referencePath: REFERENCE_PATH,
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
