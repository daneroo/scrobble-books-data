/**
 * The `goodreads.json` schema: a plain array, one flat object per entry (a
 * book on the user's shelves), in list order, last updated first. The CUE
 * twin is `cue/check-goodreads.cue`, with the same comments; keep the two in
 * step, with the example `cue/goodreads-example.json`.
 *
 * Each field comes from one of three signed-in pages, all on
 * `https://www.goodreads.com`:
 *
 * - list page: `/review/list/<user>?shelf=%23ALL%23&per_page=100&sort=date_updated&order=d&page=<n>`,
 *   one row `tr[id^="review_"]` per entry; a row's cell is
 *   `td.field.<name> > div.value`, exactly one, or the run fails
 *   (`layout-change`). The page's title must name the user, and its sidebar
 *   (`#paginatedShelfList`, above the divider) must count every exclusive
 *   shelf; every page's sidebar must equal page 1's, every page but the last
 *   must have 100 rows, each exclusive shelf's unique books must equal its
 *   sidebar count, and no `bookId` may be listed twice.
 * - review page: `/review/show/<id>`; its heading's shelf link
 *   (`h1 a[href*="shelf="]`), exactly one, must name an exclusive shelf, the
 *   entry's `userExclusiveShelf`.
 * - book page: `bookURL`, `/book/show/<bookId>-<slug>`; its embedded JSON
 *   (`<script id="__NEXT_DATA__">`) must have `props.pageProps.apolloState`,
 *   with exactly one `Book` whose `legacyId` is `bookId`, and that `Book`'s
 *   work (`work.__ref`) and primary contributor
 *   (`primaryContributorEdge.node.__ref`).
 *
 * Every page must answer 200 and be signed in. A missing page part or row
 * cell fails the run as `layout-change`; a missing element inside a cell, or
 * a value off its format, as `parse-failure`. A failed run publishes nothing.
 *
 * Dates are ISO 8601 UTC, written with milliseconds (`toISOString`). A day a page shows is a US
 * Pacific day, stored as the start of that day in `America/Los_Angeles`, in
 * UTC: precise to the day only.
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
 * One row of a review page's reading timeline, as shown, uninterpreted.
 *
 * - Elements: one `.readingTimeline__row`, with exactly one
 *   `.readingTimeline__text` (`layout-change` otherwise).
 * - Transform: the text without the owner-only "Add a date" link
 *   (`a.add_date_link`), whitespace collapsed, trimmed, then split at its
 *   first en dash: the date before it, the event after it, both trimmed; a
 *   row with no en dash has no date.
 */
export const TimelineRow = z.strictObject({
  /**
   * The row's date, as shown: "October 23, 2026", "January, 1997", "2021";
   * `""` when the row has no date. Format: text ending in a 4-digit year, or
   * `""`; its precision is what it shows (a day, a month or a year), not
   * interpreted.
   */
  dateText: z.union([z.literal(""), z.string().regex(TIMELINE_DATE)]),
  /**
   * The rest of the row, as shown: "Shelved", "Shelved as: on-deck", "44.0%",
   * "Started Reading", "Finished Reading"; a row ending in
   * " (<format> Edition)" is an event of another edition of the same work:
   * "Started Reading (Hardcover Edition)". Format: not empty.
   */
  event: z.string().min(1),
});
export type TimelineRow = z.infer<typeof TimelineRow>;

/** An entry's fields from its list page row. */
export const ListItem = z.strictObject({
  /**
   * The entry's key: its Goodreads review id; `/review/show/<id>` is its
   * review page.
   *
   * - Page: list page.
   * - Elements: the row's `id` attribute, `review_<id>`.
   * - Transform: `review_` removed.
   * - Format: digits, "9069353168".
   */
  id: z.string().regex(/^\d+$/),
  /**
   * The edition's title, with its series.
   *
   * - Page: list page.
   * - Elements: the `title` attribute of the first `a[title]` in the `title`
   *   cell.
   * - Transform: HTML-decoded.
   * - Format: not empty, "A Drop of Corruption (Ana and Din Mysteries, #2)".
   */
  title: z.string().min(1),
  /**
   * The edition's Goodreads book id.
   *
   * - Page: list page.
   * - Elements: the `data-resource-id` attribute of the first element that
   *   has one in the `cover` cell.
   * - Checks: no book id is listed twice (`duplicate-book`).
   * - Format: digits, "213618143".
   */
  bookId: z.string().regex(/^\d+$/),
  /**
   * The edition's book page, with its slug; the book page is fetched there.
   *
   * - Page: list page.
   * - Elements: the `href` of the first `a[title]` in the `title` cell.
   * - Transform: made absolute against `https://www.goodreads.com`.
   * - Format: `https://www.goodreads.com/book/show/<bookId>…`,
   *   "https://www.goodreads.com/book/show/6617037-debt" (zod parses it as a
   *   URL; CUE checks the prefix).
   */
  bookURL: z.url().regex(/^https:\/\/www\.goodreads\.com\/book\/show\/\d+/),
  /**
   * The edition's cover, as the list shows it (small); Goodreads' placeholder
   * when the edition has none.
   *
   * - Page: list page.
   * - Elements: the `src` of the first `img` in the `cover` cell.
   * - Format: an `https` URL (zod parses it as a URL; CUE checks the
   *   `https://` prefix).
   */
  bookImageURL: z.url({ protocol: /^https$/ }),
  /**
   * The edition's ISBN.
   *
   * - Page: list page.
   * - Elements: the text of the `isbn` cell.
   * - Transform: whitespace collapsed, trimmed.
   * - Format: 10 or 13 of `0-9` and `X`, "139812219X"; `""` when the edition
   *   has none.
   */
  isbn: z.string().regex(/^([0-9X]{10}|[0-9X]{13})?$/),
  /**
   * The user's rating.
   *
   * - Page: list page.
   * - Elements: the `.stars` of the `rating` cell: its `data-rating`, or,
   *   without one, `data-pre-release="true"` (a book not yet published can't
   *   be rated).
   * - Transform: `data-rating` as a number; a pre-release book is 0.
   * - Format: a number from 0 to 5, fractional as rated (4.25, 4.5); 0 is
   *   unrated.
   */
  userRating: z.number().min(0).max(5),
  /**
   * The day the user added the entry.
   *
   * - Page: list page.
   * - Elements: the text of the first `span` in the `date_added` cell,
   *   "Nov 01, 2026".
   * - Transform: that US Pacific day, as its start in `America/Los_Angeles`,
   *   in UTC.
   * - Format: ISO 8601 UTC, precise to the day: "2026-11-01T07:00:00.000Z"
   *   (PDT), "2026-12-01T08:00:00.000Z" (PST).
   */
  userAddedAt: z.iso.datetime(),
  /**
   * The one exclusive shelf the entry is on.
   *
   * - Page: list page.
   * - Elements: the text of each `a.shelfLink` in the `shelves` cell:
   *   exactly one, or the run fails (`parse-failure`).
   * - Checks: equal to the review page's heading shelf (`shelf-mismatch`);
   *   each shelf's unique books equal its sidebar count (`count-mismatch`).
   * - Format: one of "to-read", "currently-reading", "read",
   *   "did-not-finish", "on-deck".
   */
  userExclusiveShelf: z.enum(EXCLUSIVE_SHELVES),
  /**
   * Goodreads' average rating, as the list's "avg rating" column shows it,
   * to one decimal, only to avoid flapping: a second decimal would change
   * almost every day.
   *
   * - Page: list page.
   * - Elements: the text of the `avg_rating` cell, "4.47".
   * - Transform: whitespace collapsed, trimmed; two decimals rounded to one
   *   with `toFixed(1)`: 4.47 → "4.5", 4.05 → "4.0" (not half-up).
   * - Format: a digit, a dot, a digit: "4.5".
   */
  averageRating: z.string().regex(/^\d\.\d$/),
  /**
   * The work's original publication date, as shown.
   *
   * - Page: list page.
   * - Elements: the text of the `date_pub` cell.
   * - Transform: whitespace collapsed, trimmed.
   * - Format: any text, not interpreted: "Sep 27, 2016", "Jan 2027", "2016",
   *   "-550", "unknown".
   */
  bookPublished: z.string(),
  /**
   * The edition's page count.
   *
   * - Page: list page.
   * - Elements: the text of the `num_pages` cell, "1,280 pp" or "unknown".
   * - Transform: whitespace collapsed, trimmed; "1,280 pp" → "1280",
   *   "unknown" → "0".
   * - Format: digits, whole pages: "1280"; "0" when unknown.
   */
  numPages: z.string().regex(/^\d+$/),
});
export type ListItem = z.infer<typeof ListItem>;

/**
 * An entry: its list page row, then its book page's work, review update,
 * description and author, and its review page's review and timeline.
 */
export const Item = ListItem.extend({
  /**
   * The edition's work: all editions of the book, on Goodreads. Entries of
   * the same work are kept as they are, one per edition, never merged; a run
   * that passes ends with a warning counting the works with more than one
   * entry.
   *
   * - Page: book page.
   * - Elements: in `apolloState`, the `legacyId` of the `Work` that the
   *   `Book`'s `work` points to; a page without that `Work` fails
   *   (`layout-change`).
   * - Checks: a positive integer (`parse-failure` otherwise).
   * - Transform: the number as digits.
   * - Format: digits, "25369241"; `/work/editions/<workId>` lists its
   *   editions.
   */
  workId: z.string().regex(/^\d+$/),
  /**
   * The last update of the user's review record (rating or review).
   *
   * - Page: book page.
   * - Elements: in `apolloState`, the `updatedAt` of the `Review` that the
   *   `Book`'s `viewerShelving` → `Shelving`'s `review` points to.
   * - Transform: milliseconds since the epoch (a positive integer) → ISO 8601.
   * - Format: ISO 8601 UTC, precise to the millisecond:
   *   "2026-10-30T04:26:04.552Z"; absent when that `Review` or its
   *   `updatedAt` is missing: on real pages, exactly the entries with no
   *   rating or review.
   */
  reviewUpdatedAt: z.iso.datetime().optional(),
  /**
   * The user's review, as HTML.
   *
   * - Page: review page.
   * - Elements: `[itemprop=reviewBody]`, at most one (`layout-change`
   *   otherwise).
   * - Transform: its inner HTML cut from the page source as it is (`<br />`,
   *   entities kept), trimmed.
   * - Format: HTML text; `""` when there is no review.
   */
  userReview: z.string(),
  /**
   * The edition's description, as HTML.
   *
   * - Page: book page.
   * - Elements: in `apolloState`, the `Book`'s `description`.
   * - Transform: trimmed.
   * - Format: HTML text as Goodreads has it (`<br />`, `<i>`, `<b>`); may be
   *   `""`.
   */
  bookDescription: z.string(),
  /**
   * The edition's primary contributor.
   *
   * - Page: book page.
   * - Elements: in `apolloState`, the `name` of the `Contributor` that the
   *   `Book`'s `primaryContributorEdge.node` points to.
   * - Format: not empty, as shown, spacing kept: "Mark  Lawrence".
   */
  authorName: z.string().min(1),
  /**
   * The entry's reading timeline, in page order, as shown: one
   * `TimelineRow` per row.
   *
   * - Page: review page.
   * - Elements: `.readingTimeline`, exactly one (`layout-change`
   *   otherwise); its `.readingTimeline__row`s.
   * - Format: an array of rows; on real pages never empty (the "Shelved"
   *   row is always there).
   */
  timeline: z.array(TimelineRow),
});
export type Item = z.infer<typeof Item>;

/** Every entry, in list order: last updated first. */
export const Goodreads = z.array(Item);
export type Goodreads = z.infer<typeof Goodreads>;
