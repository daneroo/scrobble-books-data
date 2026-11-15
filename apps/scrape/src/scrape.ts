/**
 * The scraper's single entry point: `bun run scrape`. See HELP below.
 *
 * It uses the session saved by `bun run login` (it never signs in),
 * fetches every list page through the flow controller, checks completeness, fetches every book's review page (exclusive shelf and
 * reading timeline) and checks its shelf, fetches every book page
 * (description, author and review update), and writes `goodreads.json` and
 * one segment per list page, all checked by CUE. Any failure fails closed.
 * With `--cached`, a page saved by an earlier run is read, not fetched.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ScrapeFailure, type Failure } from "./failure.ts";
import { createFlow, formatEvent, type Flow } from "./flow/flow.ts";
import { flowSettings } from "./flow/settings.ts";
import { LIMITS } from "./limits.ts";
import { savedSession } from "./login/login.ts";
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

Uses the Goodreads session saved by bun run login, fetches every list page
(all shelves, 100 books a page), checks that every book is there exactly once, then fetches every
book's review page and checks that its shelf equals the list page's, then
every book's page (description, author and review update). Writes:

  goodreads.json          every book: its list-page fields, its review and
                          reading timeline, its description and author (repo
                          root)
  data/scrape/segments/   one file per list page, in the same schema
  data/scrape/pages/      the raw list, review and book pages, as fetched

CUE checks goodreads.json and every segment before it is written. Any
failure is named, exits 1, and leaves goodreads.json as it was.

Options:
  --cached             A read-through cache of the raw pages: a page already
                       in data/scrape/pages/ is read from there, any other
                       is fetched and saved there. Without it, that folder
                       is cleared and every page is fetched. No expiry: to
                       refresh, run without --cached. A saved page is
                       read at once, with no wait under the rate cap:
                       --rate applies to fetched pages only.
  -c, --concurrency N  Requests in flight at most; 1 is strictly sequential.
                       Default ${LIMITS.concurrency}.
  --rate R|none        The maximum number of requests started per second
                       (e.g. 2, or 0.5 for one every 2 s), or "none" for no
                       cap. Default ${LIMITS.ratePerSecond}.
  -h, --help           Show this help.

Sign-in: it never signs in. It uses the session that bun run login saved in
secrets/browser-profile/ (gitignored); signed out, it fails as signed-out:
run bun run login.

GOODREADS_USER is read from secrets/GOODREADS.env.
`;

const secrets: Secrets = {
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
  let cached: boolean;
  let flow: Flow;
  const deadline = new AbortController();
  // every log line is redacted (X4); the cookie is added once there is one
  let redact = redactor(secrets);
  try {
    const { values } = parseArgs({
      args,
      options: {
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
    cached = values.cached ?? false;
    const settings = flowSettings(args);
    // the settings in effect, defaults included, at the top of every run
    console.log(
      `scrape: -c ${settings.concurrency} --rate ${settings.ratePerSecond ?? "none"}, --cached ${cached ? "yes" : "no"}`,
    );
    flow = createFlow(settings, {
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

  if (secrets.user === "") {
    return fail({
      step: "setup",
      mode: "missing-credentials",
      detail: "unset: GOODREADS_USER",
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
      const result = await savedSession();
      if (!result.ok) return fail(result.failure);
      console.log("login: reusing the saved session");
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
