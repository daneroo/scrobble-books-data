/**
 * The scraper's single entry point: `bun run scrape`. See HELP below.
 *
 * A run is one or more passes. Each pass reads the session saved by
 * `bun run login` (it never signs in), fetches every list page through the
 * flow controller, checks completeness, fetches every book's review page
 * and checks its shelf, fetches every book page, and writes
 * `goodreads.json`, checked by CUE. A pass that fails on a WAF challenge or
 * on too many retries is restarted after 60 s, reusing the pages fetched so
 * far; any other failure ends the run. `--publish` adds the git steps.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ScrapeFailure, type Failure } from "./failure.ts";
import { realClock, type Clock } from "./flow/clock.ts";
import { createFlow, formatEvent, type FlowSettings } from "./flow/flow.ts";
import { flowSettings } from "./flow/settings.ts";
import { LIMITS } from "./limits.ts";
import { savedSession, type SessionResult } from "./login/login.ts";
import { openRunLog, type RunLogOptions } from "./logs.ts";
import { removeRunFiles } from "./outputs.ts";
import { signedInSource } from "./pages/source.ts";
import { afterScrape, beforeScrape } from "./publish.ts";
import { redactor, report, type Outcome, type Secrets } from "./report.ts";
import { runWithRestarts } from "./restart.ts";
import { failureOf, runScrape } from "./run.ts";

const ROOT = join(import.meta.dir, "../../..");

const HELP = `Usage: bun run scrape [options]

Uses the Goodreads session saved by bun run login, fetches every list page
(all shelves, 100 books a page), checks that every book is there exactly once, then fetches every
book's review page and checks that its shelf equals the list page's, then
every book's page (description, author and review update). Writes
goodreads.json (repo root): every book, its list-page fields, its review and
reading timeline, its description and author.

CUE checks goodreads.json before it is written. Any failure is named, exits
1, and leaves goodreads.json as it was.

Restarts: a pass that fails on a WAF challenge (a 202) or on too many
retries is restarted after ${LIMITS.restartWaitMs / 1000} s, at most ${LIMITS.restartsPerRun} times; a restart
reads the pages already fetched in this run instead of fetching them again.
Any other failure ends the run at once.

On disk: the raw pages go to data/scrape/pages/ during the run, and are
deleted when it ends. The log goes to data/logs/; the last 20 are kept.

Options:
  --publish            Git steps around the scrape: on main with a clean
                       tree, git pull; then scrape; then, if goodreads.json
                       changed, commit it alone and push.
  --save-pages         Keep the raw pages in data/scrape/pages/ after the run.
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

/** What a run reads and writes; tests replace each one. */
export interface MainDeps {
  /** The repository root: `goodreads.json`, `data/`. */
  root: string;
  env: { GOODREADS_USER?: string };
  /** Reads the saved session, once per pass. */
  session?: () => Promise<SessionResult>;
  /** The transport; tests serve pages through a fake Goodreads. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  clock?: Clock;
  random?: () => number;
  /** Wall-clock time: commit stamps and log names. */
  now?: () => Date;
  print?: RunLogOptions["print"];
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), {
    root: ROOT,
    env: { GOODREADS_USER: process.env.GOODREADS_USER },
  });
}

/** Runs `bun run scrape` with `args`; resolves with the exit code. */
export async function main(args: string[], deps: MainDeps): Promise<number> {
  const { root, clock = realClock, now = () => new Date() } = deps;
  let values: { publish?: boolean; "save-pages"?: boolean; help?: boolean } =
    {};
  let settings: FlowSettings | undefined;
  let badConfig: string | undefined;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        publish: { type: "boolean" },
        "save-pages": { type: "boolean" },
        concurrency: { type: "string", short: "c" },
        rate: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    }));
    settings = flowSettings(args);
  } catch (error) {
    badConfig = `${error instanceof Error ? error.message : String(error)}; see --help`;
  }
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const secrets: Secrets = { user: deps.env.GOODREADS_USER ?? "" };
  // every log line is redacted (X4), with every cookie seen so far
  const cookies: string[] = [];
  const redact = (line: string) => redactor(secrets, cookies.join("; "))(line);
  const runLog = openRunLog({
    dir: join(root, "data/logs"),
    now,
    print: deps.print,
  });
  const log = (line: string) => runLog.out(redact(line));
  const logError = (line: string) => runLog.err(redact(line));
  const end = async (code: number) => {
    await runLog.close();
    return code;
  };
  const fail = (failure: Failure) => {
    for (const line of report({ ok: false, failure }, secrets).lines)
      logError(line);
    return end(1);
  };

  const publish = values.publish ?? false;
  const savePages = values["save-pages"] ?? false;
  if (settings === undefined)
    return fail({ step: "setup", mode: "bad-config", detail: badConfig ?? "" });
  const flowIn: FlowSettings = settings;
  // the settings in effect, defaults included, at the top of every run
  const yesNo = (value: boolean) => (value ? "yes" : "no");
  log(
    `scrape: -c ${flowIn.concurrency} --rate ${flowIn.ratePerSecond ?? "none"}, --publish ${yesNo(publish)}, --save-pages ${yesNo(savePages)}`,
  );
  if (secrets.user === "") {
    return fail({
      step: "setup",
      mode: "missing-credentials",
      detail: "unset: GOODREADS_USER",
    });
  }

  if (publish) {
    const stop = await beforeScrape({ root, log });
    if (stop !== undefined) {
      logError(`publish: ${stop}`);
      return end(1);
    }
  }

  const dataDir = join(root, "data/scrape");
  let stamp = "";
  const { outcome, passes } = await runWithRestarts({
    clock,
    log,
    pass: async (n) => {
      stamp = now()
        .toISOString()
        .replace(/\.\d+Z$/, "Z");
      log(`pass ${n}: start ${stamp}`);
      return await runPass({
        n,
        user: secrets.user,
        settings: flowIn,
        deps,
        clock,
        dataDir,
        publishPath: join(root, "goodreads.json"),
        log,
        onCookie: (cookie) => cookies.push(cookie),
      });
    },
  });
  await removeRunFiles(dataDir, { savePages });

  const { lines, exitCode } = report(outcome, secrets);
  for (const line of lines) (exitCode === 0 ? log : logError)(line);
  const ending = `${outcome.ok ? "passed" : "failed"} after ${passes} ${passes === 1 ? "pass" : "passes"}`;
  if (!publish || !outcome.ok) {
    log(`run end: ${ending}`);
    return end(exitCode);
  }
  const { ok, result } = await afterScrape({ root, log, stamp });
  (ok ? log : logError)(`run end: ${ending}; publish: ${result}`);
  return end(ok ? 0 : 1);
}

/** One pass: the session, a new flow, then the scrape. */
async function runPass(options: {
  n: number;
  user: string;
  settings: FlowSettings;
  deps: MainDeps;
  clock: Clock;
  dataDir: string;
  publishPath: string;
  log: (line: string) => void;
  onCookie: (cookie: string) => void;
}): Promise<Outcome> {
  const { n, user, settings, deps, clock, dataDir, publishPath, log } = options;
  const { session = savedSession } = deps;
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort(
      new ScrapeFailure({
        step: "list-pages",
        mode: "run-timeout",
        detail: `the pass passed its ${LIMITS.passDeadlineMs / 60_000} min deadline`,
      }),
    );
  }, LIMITS.passDeadlineMs);
  try {
    let cookie: string;
    let userAgent: string;
    try {
      const result = await session();
      if (!result.ok) return { ok: false, failure: result.failure };
      ({ cookie, userAgent } = result);
      options.onCookie(cookie);
      log("login: reusing the saved session");
    } catch (error) {
      return { ok: false, failure: failureOf(error, "login") };
    }

    const flow = createFlow(settings, {
      clock,
      random: deps.random,
      signal: deadline.signal,
      onEvent: (event) => log(formatEvent(event)),
    });
    const source = (
      step: "list-pages" | "review-pages" | "book-pages",
      timeoutMs: number,
    ) =>
      signedInSource({
        cookie,
        userAgent,
        timeoutMs,
        step,
        fetch: deps.fetch,
        clock,
      });
    return await runScrape({
      user,
      sources: {
        list: source("list-pages", LIMITS.listPageTimeoutMs),
        review: source("review-pages", LIMITS.reviewPageTimeoutMs),
        book: source("book-pages", LIMITS.bookPageTimeoutMs),
      },
      reusePages: n > 1,
      flow,
      dataDir,
      publishPath,
      signal: deadline.signal,
      log,
    });
  } finally {
    clearTimeout(timer);
  }
}
