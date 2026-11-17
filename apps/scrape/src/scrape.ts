/**
 * The scraper's single entry point: `bun run scrape`.
 *
 * A run is one or more passes. Each pass reads the session saved by
 * `bun run login` (it never signs in), fetches every list page through the
 * flow controller, checks completeness, fetches every book's review page
 * and checks its shelf, fetches every book page, and writes
 * `goodreads.json`, checked by CUE. A pass that fails on a WAF challenge or
 * on too many retries is restarted after 60 s, reusing the pages fetched so
 * far; any other failure ends the run. `--publish` uploads a passing
 * run's `goodreads.json` to S3 (upload.ts); the scraper never runs git.
 * `--help` is generated from SCRAPE.
 */
import { join } from "node:path";

import { parseCommand, SCRAPE_OPTIONS, type Command } from "./cli.ts";
import { ScrapeFailure, type Failure } from "./failure.ts";
import { realClock, type Clock } from "./flow/clock.ts";
import { createFlow, formatEvent, type FlowSettings } from "./flow/flow.ts";
import { flowSettings } from "./flow/settings.ts";
import { LIMITS } from "./limits.ts";
import { savedSession, type SessionResult } from "./login/login.ts";
import {
  LOGS_KEPT,
  openRunLog,
  printToConsole,
  type RunLogOptions,
} from "./logs.ts";
import { removeRunFiles } from "./outputs.ts";
import { signedInSource } from "./pages/source.ts";
import { progressLines } from "./progress.ts";
import { redactor, report, type Outcome, type Secrets } from "./report.ts";
import { runWithRestarts } from "./restart.ts";
import { failureOf, runScrape } from "./run.ts";
import { readS3Env, s3Upload, type S3Env, type Upload } from "./upload.ts";

const ROOT = join(import.meta.dir, "../../..");

/** `bun run scrape`, for `--help`. */
export const SCRAPE: Command = {
  name: "bun run scrape",
  description: `Uses the Goodreads session saved by bun run login, fetches every list page (all shelves, 100 books a page), checks that every book is there exactly once, then fetches every book's review page and checks that its shelf equals the list page's, then every book's page (description, author and review update). Writes goodreads.json (repo root): every book, its list-page fields, its review and reading timeline, its description and author.

CUE checks goodreads.json before it is written. Any failure is named, exits 1, and leaves goodreads.json as it was.

Restarts: a pass that fails on a WAF challenge (a 202) or on too many retries is restarted after ${LIMITS.restartWaitMs / 1000} s, at most ${LIMITS.restartsPerRun} times; a restart reads the pages already fetched in this run instead of fetching them again. Any other failure ends the run at once.

On disk: the raw pages go to data/scrape/pages/ during the run, and are deleted when it ends. The log goes to data/logs/, with every line; stdout shows each stage's progress at most every 10 s. The last ${LOGS_KEPT} logs are kept; a log left by a run that did not end is archived as interrupted.`,
  options: SCRAPE_OPTIONS,
  epilogue: `Sign-in: it never signs in. It uses the session that bun run login saved in secrets/browser-profile/ (gitignored); signed out, it fails as signed-out: run bun run login.

Publish: with --publish, a passing run uploads goodreads.json to S3, with the key in secrets/S3.env; every passing run, changed or not. A failed run uploads nothing; a failed upload fails the run.

GOODREADS_USER is read from secrets/GOODREADS.env.`,
};

/** What a run reads and writes; tests replace each one. */
export interface MainDeps {
  /** The repository root: `goodreads.json`, `data/`. */
  root: string;
  env: { GOODREADS_USER?: string } & S3Env;
  /** Reads the saved session, once per pass. */
  session?: () => Promise<SessionResult>;
  /** The transport; tests serve pages through a fake Goodreads. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  clock?: Clock;
  random?: () => number;
  /** Wall-clock time: pass stamps and log names. */
  now?: () => Date;
  print?: RunLogOptions["print"];
  /** `--publish`; by default the S3 upload with the key in `env`. */
  upload?: Upload;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), {
    root: ROOT,
    env: {
      GOODREADS_USER: process.env.GOODREADS_USER,
      ...readS3Env(process.env),
    },
  });
}

/** Runs `bun run scrape` with `args`; resolves with the exit code. */
export async function main(args: string[], deps: MainDeps): Promise<number> {
  const { root, clock = realClock, now = () => new Date() } = deps;
  const parsed = await parseCommand(SCRAPE, args);
  if (parsed.kind === "help") {
    (deps.print ?? printToConsole)(parsed.text, "out");
    return 0;
  }
  let values: Record<string, unknown> = {};
  let settings: FlowSettings | undefined;
  let badConfig: string | undefined;
  try {
    if (parsed.kind === "error") throw new Error(parsed.message);
    values = parsed.values;
    settings = flowSettings(args);
  } catch (error) {
    badConfig = `${error instanceof Error ? error.message : String(error)}; see --help`;
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

  if (runLog.interrupted !== undefined)
    log(`log: archived a run that did not end: ${runLog.interrupted}`);
  const publish = values.publish === true;
  const savePages = values["save-pages"] === true;
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

  let upload: Upload | undefined = publish ? deps.upload : undefined;
  if (publish && upload === undefined) {
    const s3 = s3Upload(deps.env);
    if (!s3.ok) {
      return fail({
        step: "setup",
        mode: "missing-credentials",
        detail: `unset: ${s3.missing.join(", ")} (secrets/S3.env)`,
      });
    }
    upload = s3.upload;
  }

  const dataDir = join(root, "data/scrape");
  const publishPath = join(root, "goodreads.json");
  const { outcome, passes } = await runWithRestarts({
    clock,
    log,
    pass: async (n) => {
      const stamp = now()
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
        publishPath,
        log,
        logFile: (line) => runLog.fileOnly(redact(line)),
        now,
        onCookie: (cookie) => cookies.push(cookie),
      });
    },
  });
  await removeRunFiles(dataDir, { savePages });

  const { lines, exitCode } = report(outcome, secrets);
  for (const line of lines) (exitCode === 0 ? log : logError)(line);
  const ending = `${outcome.ok ? "passed" : "failed"} after ${passes} ${passes === 1 ? "pass" : "passes"}`;
  if (upload === undefined || !outcome.ok) {
    log(`run end: ${ending}`);
    return end(exitCode);
  }
  try {
    const where = await upload(publishPath);
    log(`run end: ${ending}; publish: uploaded to ${where}`);
    return end(0);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    logError(`run end: ${ending}; publish: upload failed: ${why}`);
    return end(1);
  }
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
  /** Writes a line to the log file only. */
  logFile: (line: string) => void;
  now: () => Date;
  onCookie: (cookie: string) => void;
}): Promise<Outcome> {
  const { n, user, settings, deps, clock, dataDir, publishPath, log } = options;
  const { logFile, now } = options;
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

    // per-request lines to the log file only; stdout gets compact progress
    const progress = progressLines({ clock, now });
    const flow = createFlow(settings, {
      clock,
      random: deps.random,
      signal: deadline.signal,
      onEvent: (event) => {
        if (event.type !== "request") return log(formatEvent(event));
        logFile(formatEvent(event));
        const line = progress(event);
        if (line !== undefined) log(line);
      },
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
