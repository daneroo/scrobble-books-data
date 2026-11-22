/**
 * What the scraper reads from a stored reading timeline: its own rows (not
 * another edition's), the days they show, its "Shelved" rows, and its reads.
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

/** A month and year, as a timeline shows it: "February, 1997". */
const MONTH = /^([A-Z][a-z]+), (\d{4})$/;

/** A year alone, as a timeline shows it: "2021". */
const YEAR = /^(\d{4})$/;

/**
 * A finish's date as the start of its US Pacific day, in UTC, ISO 8601: a
 * day as shown; a month or a year padded to its 1st day ("February, 1997" →
 * February 1, 1997; "2021" → January 1, 2021). `undefined` for any other
 * text.
 */
function readDayStart(dateText: string): string | undefined {
  const day = dayStart(dateText);
  if (day !== undefined) return day;
  const month = MONTH.exec(dateText);
  if (month !== null) {
    const index = MONTHS.indexOf(month[1]!);
    return index < 0 ? undefined : pacificMidnight(Number(month[2]), index, 1);
  }
  const year = YEAR.exec(dateText);
  return year === null ? undefined : pacificMidnight(Number(year[1]), 0, 1);
}

/** An entry's reads, from its own "Finished Reading" rows. */
export interface Reads {
  userReadCount: number;
  userFirstReadAt?: string;
  userLastReadAt?: string;
}

/**
 * The entry's reads: one per own "Finished Reading" row, dated or not; the
 * first and last of the dated ones. A dated finish in no known format is
 * returned in `unknownDates`, as shown, for the caller to fail on.
 */
export function readsOf(timeline: readonly TimelineRow[]): {
  reads: Reads;
  unknownDates: string[];
} {
  const finishes = ownRows(timeline).filter(
    (row) => row.event === "Finished Reading",
  );
  const dated = finishes
    .filter((row) => row.dateText !== "")
    .map((row) => ({ shown: row.dateText, day: readDayStart(row.dateText) }));
  const unknownDates = dated
    .filter(({ day }) => day === undefined)
    .map(({ shown }) => shown);
  // ISO 8601 UTC strings sort as time
  const days = dated
    .map(({ day }) => day)
    .filter((day) => day !== undefined)
    .sort();
  const reads: Reads = { userReadCount: finishes.length };
  if (days.length > 0) {
    reads.userFirstReadAt = days[0]!;
    reads.userLastReadAt = days.at(-1)!;
  }
  return { reads, unknownDates };
}
