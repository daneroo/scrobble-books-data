/**
 * The `goodreads.json` schema, also used by each segment (one list page).
 *
 * A field keeps its old `goodreads-rss.json` name only where the meaning and
 * format are the same; otherwise it has a new name (#23). Sources and
 * decisions: `thoughts/field-sources.md` (#28). The CUE twin is
 * `cue/check-goodreads.cue`; keep the two in step.
 */
import { z } from "zod";

/** The exclusive shelves in use: a book is on exactly one of them. */
export const EXCLUSIVE_SHELVES = [
  "to-read",
  "currently-reading",
  "read",
  "did-not-finish",
  "on-deck",
] as const;
export type ExclusiveShelf = (typeof EXCLUSIVE_SHELVES)[number];

const MONTH = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
/** "Oct 24, 2026", "Oct 2026" or "2026", as the list page shows a date. */
const PAGE_DATE = new RegExp(`^(${MONTH} (\\d{2}, )?)?\\d{4}$`);
/** A publication date: a page date, or a bare year, which may be BC. */
const PUBLISHED = new RegExp(
  `^((${MONTH} (\\d{2}, )?)?\\d{4}|-?\\d{1,4}|unknown)$`,
);

/**
 * A date as a review page's timeline shows it, uninterpreted: text ending in
 * a year. Seen on real pages: "October 23, 2026", "January, 1997", "2021".
 */
const TIMELINE_DATE = /^(.* )?\d{4}$/;

/**
 * One row of a review page's reading timeline, as shown, uninterpreted. The
 * owner-only "Add a date" link is not part of it.
 */
export const TimelineRow = z.strictObject({
  /** "October 23, 2026", "January, 1997" or "2021"; `""` when the row has no date. */
  dateText: z.union([z.literal(""), z.string().regex(TIMELINE_DATE)]),
  /** The rest of the row: "Shelved as: on-deck", "44.0%", "Started Reading (Hardcover Edition)". */
  event: z.string().min(1),
});
export type TimelineRow = z.infer<typeof TimelineRow>;

/** A book's fields from its list page row. */
export const ListItem = z.strictObject({
  /** From the row's `review_<id>`; the old `id` and `link` are URLs of it. */
  reviewId: z.string().regex(/^\d+$/),
  /** HTML-decoded, with the series, e.g. "A Drop of Corruption (Ana and Din Mysteries, #2)". */
  title: z.string().min(1),
  bookId: z.string().regex(/^\d+$/),
  bookImageURL: z.url({ protocol: /^https$/ }),
  /** Trimmed; `""` when the edition has none. */
  isbn: z.string().regex(/^([0-9X]{10}|[0-9X]{13})?$/),
  /** Fractional, as rated: 4.25, 4.5; 0 is unrated. */
  userRating: z.number().min(0).max(5),
  /** The newest read date as shown ("Oct 24, 2026", "Oct 2026", "2026"); `""` when not set. */
  userReadAtText: z.union([z.literal(""), z.string().regex(PAGE_DATE)]),
  /** The day the book was added, `YYYY-MM-DD` (a US Pacific calendar day). */
  userDateCreatedDay: z.iso.date(),
  userExclusiveShelf: z.enum(EXCLUSIVE_SHELVES),
  /** The all-editions average, as shown ("3.58"); the RSS had the edition's. */
  averageRating: z.string().regex(/^\d\.\d{2}$/),
  /** The work's original publication, as shown: "Sep 27, 2016", "2016", "-550", "unknown". */
  bookPublishedText: z.string().regex(PUBLISHED),
  /** Whole pages, no commas; "0" when unknown. */
  numPages: z.string().regex(/^\d+$/),
});
export type ListItem = z.infer<typeof ListItem>;

/** A book: its list page row, and its reading progress from its review page. */
export const Item = ListItem.extend({
  /**
   * The review page's reading timeline, in page order, as shown. Its
   * exclusive shelf is checked to equal `userExclusiveShelf`.
   */
  timeline: z.array(TimelineRow),
});
export type Item = z.infer<typeof Item>;

export const Goodreads = z.strictObject({
  /** The user's full name, from the list page title. */
  userFullName: z.string().min(1),
  /** In list order: date added, newest first. */
  items: z.array(Item),
});
export type Goodreads = z.infer<typeof Goodreads>;
