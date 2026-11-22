/**
 * What the scraper reads from a stored reading timeline: its own rows (not
 * another edition's), the days they show, and its "Shelved" rows.
 */
import type { TimelineRow } from "../goodreads.ts";
import { pacificMidnight } from "../list/parse.ts";

/**
 * A row of another edition of the same work ends in " (<format> Edition)";
 * seen on real pages: Audiobook, Hardcover, Kindle, Mass Market Paperback,
 * Other Hardcover, Other Paperback, Paperback, ebook.
 */
const OTHER_EDITION = / \([^()]* Edition\)$/;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A whole day, as a timeline shows it: "October 23, 2026", "May 7, 2023". */
const DAY = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/;

/** The rows of this entry's own edition: other editions' rows left out. */
export function ownRows(timeline: readonly TimelineRow[]): TimelineRow[] {
  return timeline.filter((row) => !OTHER_EDITION.test(row.event));
}

/**
 * A row's day as the start of that US Pacific day, in UTC, ISO 8601;
 * `undefined` for no date or a partial one ("January, 1997", "2021").
 */
export function dayStart(dateText: string): string | undefined {
  const match = DAY.exec(dateText);
  const month = match === null ? -1 : MONTHS.indexOf(match[1]!);
  if (match === null || month < 0) return undefined;
  return pacificMidnight(Number(match[3]), month, Number(match[2]));
}

/**
 * The latest day of the entry's own rows, as the start of that Pacific day,
 * in UTC; `undefined` when none of them shows a whole day.
 */
export function latestOwnDay(
  timeline: readonly TimelineRow[],
): string | undefined {
  // ISO 8601 UTC strings sort as time
  return ownRows(timeline)
    .map((row) => dayStart(row.dateText))
    .filter((day) => day !== undefined)
    .sort()
    .at(-1);
}

/** The dates of the entry's own "Shelved" rows, as shown; one on real pages. */
export function shelvedDates(timeline: readonly TimelineRow[]): string[] {
  return ownRows(timeline)
    .filter((row) => row.event === "Shelved")
    .map((row) => row.dateText);
}
