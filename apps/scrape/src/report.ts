import type { Failure } from "./failure.ts";
import type { ExclusiveShelf } from "./goodreads.ts";

/** A work on the list more than once: one `id` per edition, in list order. */
export interface RepeatedWork {
  workId: string;
  ids: string[];
}

/**
 * A `userAddedAt` whose day is not its timeline's one "Shelved" row's day,
 * or a timeline without exactly one such row: none on 2026-11-21 (1458
 * agreed).
 */
export interface ShelvedDayMismatch {
  id: string;
  userAddedAt: string;
  /** The dates of the entry's own "Shelved" rows, as shown. */
  shelvedDates: string[];
}

/**
 * A list row's "# times read" that is not its `userReadCount`, plus 1 on
 * "currently-reading": none on 2026-11-21 (1458 agreed).
 */
export interface ReadCountMismatch {
  id: string;
  userExclusiveShelf: ExclusiveShelf;
  userReadCount: number;
  /** The list row's "# times read". */
  timesRead: number;
}

/**
 * A `bookPublished` kept as shown, in none of the formats it is normalized
 * from: none on 2026-11-21.
 */
export interface PublishedAsShown {
  id: string;
  bookPublished: string;
}

/** The result of a run. The cookie is only there to keep it out of the log. */
export type Outcome =
  | {
      ok: true;
      cookie?: string;
      books: number;
      pages: number;
      reviewPages: number;
      bookPages: number;
      /** Where `goodreads.json` was written. */
      published: string;
      /**
       * Each work on the list more than once, in list order: a warning,
       * counted on screen; the list itself is kept here, as data.
       */
      repeatedWorks: RepeatedWork[];
      /**
       * Each `userAddedAt` off its "Shelved" row's day, in list order: a
       * warning, counted on screen; the list itself is kept here, as data.
       */
      shelvedDayMismatches: ShelvedDayMismatch[];
      /**
       * Each list row's "# times read" off its `userReadCount`, in list
       * order: a warning, counted on screen; the list itself is kept here,
       * as data.
       */
      readCountMismatches: ReadCountMismatch[];
      /**
       * The `id` of each book on "read" with a `userReadCount` of 0, in list
       * order (none on 2026-11-21: 793 of 793 had a finish): a warning,
       * counted on screen; the list itself is kept here, as data.
       */
      readWithoutFinish: string[];
      /**
       * Each `bookPublished` kept as shown, in list order: a warning,
       * counted on screen; the list itself is kept here, as data.
       */
      publishedAsShown: PublishedAsShown[];
    }
  | { ok: false; cookie?: string; failure: Failure };

/** Values that must never reach a log. */
export interface Secrets {
  user: string;
}

/** Log lines, and the process exit code. */
export interface Report {
  lines: string[];
  exitCode: number;
}

/** Turns an outcome into log lines and the process exit code. */
export function report(outcome: Outcome, secrets: Secrets): Report {
  const { lines, exitCode } = summarize(outcome);
  const redact = redactor(secrets, outcome.cookie);
  return { lines: lines.map(redact), exitCode };
}

function summarize(outcome: Outcome): Report {
  if (!outcome.ok) {
    const { step, mode, detail, url, status } = outcome.failure;
    const lines = [`FAIL: ${step} ${mode}: ${detail}`];
    if (url !== undefined) lines.push(`  url: ${withoutQuery(url)}`);
    if (status !== undefined) lines.push(`  status: ${status}`);
    return { lines, exitCode: 1 };
  }
  return {
    lines: [
      `PASS: ${outcome.books} books from ${outcome.pages} list pages, ${outcome.reviewPages} review pages and ${outcome.bookPages} book pages; wrote ${outcome.published}`,
      // kept as they are, never merged: the owner decides on Goodreads
      ...countLine(
        outcome.repeatedWorks.length,
        "WARN: 1 work has more than one entry",
        (n) => `WARN: ${n} works have more than one entry`,
      ),
      ...countLine(
        outcome.shelvedDayMismatches.length,
        'WARN: 1 book has a userAddedAt off its "Shelved" row\'s day',
        (n) =>
          `WARN: ${n} books have a userAddedAt off their "Shelved" row's day`,
      ),
      ...countLine(
        outcome.readCountMismatches.length,
        'WARN: 1 book has a userReadCount off its list row\'s "# times read"',
        (n) =>
          `WARN: ${n} books have a userReadCount off their list rows' "# times read"`,
      ),
      ...countLine(
        outcome.readWithoutFinish.length,
        'WARN: 1 book on "read" has no finish',
        (n) => `WARN: ${n} books on "read" have no finish`,
      ),
      ...countLine(
        outcome.publishedAsShown.length,
        "WARN: 1 book has a bookPublished kept as shown",
        (n) => `WARN: ${n} books have a bookPublished kept as shown`,
      ),
    ],
    exitCode: 0,
  };
}

/** A warning's one line, with its count only; none when the count is 0. */
function countLine(
  count: number,
  one: string,
  many: (count: number) => string,
): string[] {
  if (count === 0) return [];
  return [count === 1 ? one : many(count)];
}

// Cookie values shorter than this (e.g. `locale=en`) aren't secret, and
// replacing them everywhere would garble the log.
const MIN_COOKIE_VALUE_LENGTH = 6;

/**
 * Replaces every secret, the cookie and each long cookie value. Every log
 * line goes through it (X4).
 */
export function redactor(
  secrets: Secrets,
  cookie = "",
): (line: string) => string {
  const cookieValues = cookie
    .split(";")
    .map((pair) => pair.slice(pair.indexOf("=") + 1).trim())
    .filter((value) => value.length >= MIN_COOKIE_VALUE_LENGTH);
  const values = [secrets.user, cookie, ...cookieValues]
    .flatMap((value) => [value, encodeURIComponent(value)])
    .filter((value) => value !== "")
    // longest first, so the whole cookie goes before its parts
    .sort((a, b) => b.length - a.length);
  return (line) =>
    values.reduce((text, value) => text.replaceAll(value, "[redacted]"), line);
}

// Query strings on Amazon sign-in and verification pages carry session-ish
// tokens and say nothing useful.
function withoutQuery(url: string): string {
  try {
    const { origin, pathname } = new URL(url);
    return origin + pathname;
  } catch {
    return url.split("?")[0] ?? "";
  }
}
