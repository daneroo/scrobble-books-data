/**
 * The compatibility mapping: `goodreads.json` → `goodreads-rss.json`, in the
 * old RSS conventions, which scrobbleCast reads. Sources and decisions:
 * `thoughts/field-sources.md` (#28). The CUE check is `cue/check-output.cue`.
 */
import type { Goodreads, Item } from "../goodreads.ts";

/** The feed title, a constant from the reference copy (S9). */
export const FEED_TITLE = "Daniel's bookshelf: all";

/** One `goodreads-rss.json` item: 19 strings, in the reference's order. */
export interface CompatItem {
  id: string;
  title: string;
  link: string;
  bookId: string;
  bookImageURL: string;
  bookDescription: string;
  authorName: string;
  isbn: string;
  userName: string;
  userRating: string;
  userReadAt: string;
  userDateAdded: string;
  userDateCreated: string;
  userShelves: string;
  userReview: string;
  averageRating: string;
  bookPublished: string;
  description: string;
  numPages: string;
}

export interface Compat {
  title: string;
  items: CompatItem[];
}

/** The whole file, in list order. */
export function toCompat(goodreads: Goodreads): Compat {
  return {
    title: FEED_TITLE,
    items: goodreads.items.map((item) =>
      toCompatItem(item, goodreads.userFullName),
    ),
  };
}

/**
 * One book in the old conventions:
 * - `id` and `link`: the review URL, with the RSS's query;
 * - `userName`: the first word of the full name;
 * - `userRating`: the fractional rating floored, as a string ("4" for 4.25
 *   and 4.5), "0" when unrated;
 * - dates as `YYYY-MM-DDT00:00:00.000Z`: the time of day is not on any page
 *   (an approved difference), and a missing month or day is `01`;
 * - `userShelves`: `""` for read, otherwise the exclusive shelf;
 * - `bookDescription`: as stored, with `rel="nofollow noopener"` on every
 *   link that has no `rel`, as the RSS had;
 * - `bookPublished`: the year, `""` when unknown;
 * - `description`: the RSS's HTML summary, rebuilt from these fields.
 */
export function toCompatItem(item: Item, userFullName: string): CompatItem {
  const link = `https://www.goodreads.com/review/show/${item.reviewId}?utm_medium=api&utm_source=rss`;
  const fields = {
    id: link,
    title: item.title,
    link,
    bookId: item.bookId,
    bookImageURL: item.bookImageURL,
    bookDescription: withRel(item.bookDescription),
    authorName: item.authorName,
    isbn: item.isbn,
    userName: userFullName.split(" ")[0]!,
    userRating: String(Math.floor(item.userRating)),
    userReadAt: readAt(item.userReadAtText),
    userDateAdded: midnight(item.userDateAddedDay),
    userDateCreated: midnight(item.userDateCreatedDay),
    userShelves:
      item.userExclusiveShelf === "read" ? "" : item.userExclusiveShelf,
    userReview: item.userReview,
    averageRating: item.averageRating,
    bookPublished: year(item.bookPublishedText),
  };
  // the reference's key order: description, then numPages
  return {
    ...fields,
    description: description(fields, item.bookURL),
    numPages: item.numPages,
  };
}

/**
 * The RSS's HTML summary: a fixed template, rebuilt exactly for 1447/1447
 * books from the reference's own fields (#28).
 */
function description(
  item: Omit<CompatItem, "description" | "numPages">,
  bookURL: string,
): string {
  const indent = "\n" + " ".repeat(38);
  const line = (label: string, value: string) =>
    `${indent}${label}: ${value}<br/>`;
  return (
    `<a href="${bookURL}?utm_medium=api&amp;utm_source=rss"><img alt="${escapeHtml(item.title)}" src="${item.bookImageURL}" /></a><br/>` +
    line("author", item.authorName) +
    line("name", item.userName) +
    line("average rating", item.averageRating) +
    line("book published", item.bookPublished) +
    line("rating", item.userRating) +
    line("read at", slashed(item.userReadAt)) +
    line("date added", slashed(item.userDateAdded)) +
    line("shelves", item.userShelves) +
    line("review", `<br/>${item.userReview}`)
  );
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

/** "Oct 24, 2026", "Oct 2026", "2026" → midnight UTC of that day; "" stays "". */
export function readAt(text: string): string {
  if (text === "") return "";
  const match = /^(?:([A-Z][a-z]{2}) (?:(\d{2}), )?)?(\d{4})$/.exec(text);
  const month = match?.[1] === undefined ? 0 : MONTHS.indexOf(match[1]);
  if (match === null || month < 0)
    throw new Error(`read date not understood: ${JSON.stringify(text)}`);
  const mm = String(month + 1).padStart(2, "0");
  return midnight(`${match[3]}-${mm}-${match[2] ?? "01"}`);
}

/** "2026-10-24" → "2026-10-24T00:00:00.000Z". */
function midnight(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/** "2026-10-24T00:00:00.000Z" → "2026/10/24"; "" stays "". */
function slashed(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", "/");
}

/** "Sep 27, 2016" → "2016", "-550" → "-550", "unknown" → "". */
export function year(text: string): string {
  if (text === "unknown") return "";
  const match = /(-?\d+)$/.exec(text);
  if (match === null)
    throw new Error(`publication date not understood: ${JSON.stringify(text)}`);
  return match[1]!;
}

/**
 * Adds ` rel="nofollow noopener"` to every `<a …>` tag that has no `rel`, as
 * the RSS did: it makes 33 books' descriptions equal the reference, and
 * changes none that already did (#31).
 */
export function withRel(html: string): string {
  return html.replace(/<a\b([^>]*)>/g, (tag, attributes: string) =>
    /\brel=/.test(attributes)
      ? tag
      : `<a${attributes} rel="nofollow noopener">`,
  );
}

/** As the RSS escaped the title in `alt`. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&#39;");
}
