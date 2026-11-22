import * as cheerio from "cheerio";
import { z } from "zod";

import { ScrapeFailure } from "../failure.ts";
import {
  EXCLUSIVE_SHELVES,
  ListItem,
  type ExclusiveShelf,
} from "../goodreads.ts";

/** One list page, parsed and validated. */
export interface ListPage {
  /** From 1. */
  page: number;
  userFullName: string;
  /** The sidebar's count for each exclusive shelf. */
  counts: Record<ExclusiveShelf, number>;
  /** In page order. */
  items: ListItem[];
  /**
   * Each row's "# times read", in the order of `items`: only checked against
   * `userReadCount`, never published.
   */
  timesRead: number[];
}

/**
 * A row's "# times read": the text of its hidden `read_count` cell,
 * whitespace collapsed, trimmed; digits, "3".
 */
const TimesRead = z.string().regex(/^\d+$/);

const SidebarCounts = z.strictObject(
  Object.fromEntries(
    EXCLUSIVE_SHELVES.map((shelf) => [shelf, z.number().int().min(0)]),
  ) as Record<ExclusiveShelf, z.ZodNumber>,
);

/**
 * Parses a signed-in list page (`review/list/<user>`, table view). Every row
 * is validated with zod as it is parsed (S1).
 *
 * Throws a `ScrapeFailure`: `layout-change` when a part of the page or a
 * row's cell is missing (S3), `parse-failure` when a value fails its schema.
 * Both name the page, and the row if there is one.
 */
export function parseListPage(
  html: string,
  page: number,
  url: string,
): ListPage {
  const $ = cheerio.load(html);
  const where = `list page ${page}`;
  const fail = (mode: "layout-change" | "parse-failure", detail: string) =>
    new ScrapeFailure({
      step: "list-pages",
      mode,
      detail: `${where}: ${detail}`,
      url,
    });

  // "Pat Reader’s books on Goodreads (1,450 books)"
  const userFullName = /^(.+)’s books on Goodreads/.exec(
    $("title").text().trim(),
  )?.[1];
  if (userFullName === undefined)
    throw fail("layout-change", "no user name in the title");

  const counts = sidebarCounts($);
  if (counts === undefined)
    throw fail("layout-change", "no exclusive shelves in the sidebar");
  const checked = SidebarCounts.safeParse(counts);
  if (!checked.success)
    throw fail(
      "parse-failure",
      `sidebar: ${describeIssues(checked.error, counts)}`,
    );

  const rows = $('tr[id^="review_"]')
    .toArray()
    .map((tr, index) => {
      const row = `${where}, row ${index + 1} (${$(tr).attr("id")})`;
      const { timesRead, ...raw } = rawItem(
        $,
        $(tr),
        (detail) =>
          new ScrapeFailure({
            step: "list-pages",
            mode: "layout-change",
            detail: `${row}: ${detail}`,
            url,
          }),
      );
      const invalid = (error: z.ZodError, values: Record<string, unknown>) =>
        new ScrapeFailure({
          step: "list-pages",
          mode: "parse-failure",
          detail: `${row}: ${describeIssues(error, values)}`,
          url,
        });
      const parsed = ListItem.safeParse(raw);
      if (!parsed.success) throw invalid(parsed.error, raw);
      const times = z.strictObject({ timesRead: TimesRead }).safeParse({
        timesRead,
      });
      if (!times.success) throw invalid(times.error, { timesRead });
      return { item: parsed.data, timesRead: Number(times.data.timesRead) };
    });

  return {
    page,
    userFullName,
    counts: checked.data,
    items: rows.map((r) => r.item),
    timesRead: rows.map((r) => r.timesRead),
  };
}

/**
 * The sidebar's exclusive shelves: the shelf links above the divider, each
 * "Read ‎(786)" with `shelf=read` in its link. Non-exclusive shelves come
 * after the divider.
 */
function sidebarCounts(
  $: cheerio.CheerioAPI,
): Record<string, number> | undefined {
  const list = $("#paginatedShelfList");
  if (list.length === 0) return undefined;
  const counts: Record<string, number> = {};
  for (const child of list.children().toArray()) {
    const el = $(child);
    if (el.hasClass("horizontalGreyDivider")) break;
    const link = el.find("a").first();
    const href = link.attr("href");
    const shelf =
      href === undefined
        ? null
        : new URL(href, "https://www.goodreads.com").searchParams.get("shelf");
    const count = /\((\d+)\)\s*$/.exec(link.text())?.[1];
    if (shelf === null || count === undefined) return undefined;
    counts[shelf] = Number(count);
  }
  return Object.keys(counts).length === 0 ? undefined : counts;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** One row's values, before validation. A missing cell throws. */
function rawItem(
  $: cheerio.CheerioAPI,
  row: ReturnType<cheerio.CheerioAPI>,
  missing: (detail: string) => ScrapeFailure,
): Record<string, unknown> {
  /** A cell's value element; it must exist. */
  const cell = (name: string) => {
    const value = row.find(`td.field.${name} > div.value`);
    if (value.length !== 1) throw missing(`no ${name} cell`);
    return value;
  };
  const text = (name: string) => cell(name).text().replace(/\s+/g, " ").trim();

  const cover = cell("cover");
  const title = cell("title").find("a[title]").first();
  const stars = cell("rating").find(".stars");
  const shelves = cell("shelves")
    .find("a.shelfLink")
    .toArray()
    .map((a) => $(a).text().trim());
  const pages = text("num_pages");

  return {
    id: row.attr("id")?.replace(/^review_/, ""),
    title: title.attr("title"),
    bookId: cover.find("[data-resource-id]").first().attr("data-resource-id"),
    bookURL: absolute(title.attr("href")),
    bookImageURL: cover.find("img").first().attr("src"),
    isbn: text("isbn"),
    userRating:
      stars.attr("data-rating") !== undefined
        ? decimal(stars.attr("data-rating"))
        : // a book not yet published can't be rated: 0, as unrated (#28)
          stars.attr("data-pre-release") === "true"
          ? 0
          : undefined,
    userAddedAt: pacificDayStart(
      cell("date_added").find("span").first().text().trim(),
    ),
    userExclusiveShelf: shelves.length === 1 ? shelves[0] : shelves,
    averageRating: oneDecimal(text("avg_rating")),
    bookPublished: isoPublished(text("date_pub")),
    // "1,280 pp" → "1280"; "unknown" → "0", as in the reference
    numPages:
      pages === "unknown"
        ? "0"
        : (/^([\d,]+) pp$/.exec(pages)?.[1]?.replaceAll(",", "") ?? pages),
    // checked against userReadCount, not published
    timesRead: text("read_count"),
  };
}

/**
 * A publication date as shown, as ISO 8601 at the precision shown: a day,
 * "Nov 05, 2023" → "2023-11-05"; a month, "Jan 2027" → "2027-01"; a year,
 * padded to 4 digits, its sign kept, "1995", "100" → "0100", "-750" →
 * "-0750"; "unknown" → "". A day that is not in the calendar ("Feb 30,
 * 2023") is left as it is, for zod to reject; any other text is left as
 * shown.
 */
function isoPublished(shown: string): string {
  if (shown === "unknown") return "";
  const year = /^(-?)(\d{1,4})$/.exec(shown);
  if (year !== null) return `${year[1]}${year[2]!.padStart(4, "0")}`;
  const date = /^([A-Z][a-z]{2}) (?:(\d{2}), )?(\d{4})$/.exec(shown);
  const month = date === null ? -1 : MONTHS.indexOf(date[1]!);
  if (date === null || month < 0) return shown;
  const iso = `${date[3]}-${String(month + 1).padStart(2, "0")}`;
  if (date[2] === undefined) return iso;
  // an impossible day rolls over into the next month; setUTCFullYear, as
  // Date.UTC would take a year under 100 for 19xx
  const day = Number(date[2]);
  const real = new Date(0);
  real.setUTCFullYear(Number(date[3]), month, day);
  return real.getUTCDate() === day ? `${iso}-${date[2]}` : shown;
}

/** "/book/show/1-x" → "https://www.goodreads.com/book/show/1-x". */
function absolute(href: string | undefined): string | undefined {
  return href === undefined
    ? undefined
    : new URL(href, "https://www.goodreads.com").href;
}

/** "4.25" → 4.25; anything else is left as it is, for zod to reject. */
function decimal(value: string | undefined): unknown {
  return value !== undefined && /^\d+(\.\d+)?$/.test(value)
    ? Number(value)
    : value;
}

/**
 * "3.58" → "3.6", with `toFixed(1)` (4.05 → "4.0": not half-up), only to
 * avoid flapping; anything else is left as it is, for zod to reject.
 */
function oneDecimal(value: string): string {
  return /^\d\.\d{2}$/.test(value) ? Number(value).toFixed(1) : value;
}

/**
 * A US Pacific day as the start of that day in `America/Los_Angeles`, in
 * UTC: "Nov 01, 2026" → "2026-11-01T07:00:00.000Z" (PDT),
 * "Dec 01, 2026" → "2026-12-01T08:00:00.000Z" (PST); anything else is left
 * as it is, for zod to reject.
 */
export function pacificDayStart(value: string): string {
  const match = /^([A-Z][a-z]{2}) (\d{2}), (\d{4})$/.exec(value);
  const month = match === null ? -1 : MONTHS.indexOf(match[1]!);
  if (match === null || month < 0) return value;
  return pacificMidnight(Number(match[3]), month, Number(match[2]));
}

/**
 * The start of a US Pacific day (`month` from 0) in `America/Los_Angeles`,
 * in UTC, ISO 8601: (2026, 10, 1) → "2026-11-01T07:00:00.000Z" (PDT).
 */
export function pacificMidnight(
  year: number,
  month: number,
  day: number,
): string {
  const midnightUtc = Date.UTC(year, month, day);
  // the clocks change at 2 a.m., so midnight has the previous evening's offset
  return new Date(midnightUtc - pacificOffsetMs(midnightUtc)).toISOString();
}

const PACIFIC = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  timeZoneName: "longOffset",
});

/** The offset of `America/Los_Angeles` from UTC at `ms`: -7 h or -8 h. */
function pacificOffsetMs(ms: number): number {
  const name = PACIFIC.formatToParts(ms).find(
    (part) => part.type === "timeZoneName",
  )?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? "");
  if (match === null)
    throw new Error(`no Pacific offset: ${JSON.stringify(name)}`);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -1 : 1) * minutes * 60_000;
}

/** Each issue as `field: message (got value)`. */
export function describeIssues(
  error: z.ZodError,
  raw: Record<string, unknown>,
): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join(".") || "(row)";
      const key = issue.path[0];
      const got =
        typeof key === "string" && key in raw
          ? ` (got ${JSON.stringify(raw[key])})`
          : "";
      return `${field}: ${issue.message}${got}`;
    })
    .join("; ");
}
