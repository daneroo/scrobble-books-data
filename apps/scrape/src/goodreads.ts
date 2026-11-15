/**
 * The `goodreads.json` schema, also used by each segment (one list page): a
 * plain array, one flat object per book, with the 17 fields of the Output
 * resolution (#44). Dates are ISO 8601 UTC; a day a page shows (US Pacific)
 * is stored as the start of that day in `America/Los_Angeles`, in UTC. The
 * CUE twin is `cue/check-goodreads.cue`; keep the two in step.
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
  /** The title's link, with its slug: "https://www.goodreads.com/book/show/6617037-debt". */
  bookURL: z.url().regex(/^https:\/\/www\.goodreads\.com\/book\/show\/\d+/),
  bookImageURL: z.url({ protocol: /^https$/ }),
  /** Trimmed; `""` when the edition has none. */
  isbn: z.string().regex(/^([0-9X]{10}|[0-9X]{13})?$/),
  /** Fractional, as rated: 4.25, 4.5; 0 is unrated. */
  userRating: z.number().min(0).max(5),
  /**
   * The list's "date added", a US Pacific day, as the start of that day in
   * UTC: "Nov 01, 2026" → "2026-11-01T07:00:00.000Z".
   */
  userAddedAt: z.iso.datetime(),
  userExclusiveShelf: z.enum(EXCLUSIVE_SHELVES),
  /**
   * The average over all editions, shown as "4.04", kept with `toFixed(1)`:
   * "4.0". One decimal only to avoid flapping: every scrape that changes the
   * data is committed, and a second decimal would change almost every day.
   */
  averageRating: z.string().regex(/^\d\.\d$/),
  /** The list's "date pub", the original publication, as shown: "Sep 27, 2016", "2016", "-550", "unknown". */
  bookPublished: z.string(),
  /** Whole pages, no commas; "0" when unknown. */
  numPages: z.string().regex(/^\d+$/),
});
export type ListItem = z.infer<typeof ListItem>;

/**
 * A book: its list page row, its review and timeline from its review page,
 * and its description, author and review update from its book page.
 */
export const Item = ListItem.extend({
  /**
   * The last update of the user's review record: the book page's `updatedAt`
   * (#39). Absent when the book has no rating or review.
   */
  reviewUpdatedAt: z.iso.datetime().optional(),
  /** The review page's review, as HTML (`<br />`), trimmed; `""` when there is none. */
  userReview: z.string(),
  /** The book page's description, as HTML (`<br />`, `<i>`), as shown, trimmed (S4). */
  bookDescription: z.string(),
  /** The book page's primary contributor, as shown: spacing kept ("Mark  Lawrence"). */
  authorName: z.string().min(1),
  /**
   * The review page's reading timeline, in page order, as shown. Its
   * exclusive shelf is checked to equal `userExclusiveShelf`.
   */
  timeline: z.array(TimelineRow),
});
export type Item = z.infer<typeof Item>;

/** Every book, in list order: last updated first. */
export const Goodreads = z.array(Item);
export type Goodreads = z.infer<typeof Goodreads>;
