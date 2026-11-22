/**
 * The `goodreads.json` schema: a plain array, one flat object per entry (a
 * book on the user's shelves), in list order, last updated first. The CUE
 * twin is `cue/check-goodreads.cue`, with the same comments; keep the two in
 * step, with the example `cue/goodreads-example.json` and the page
 * `docs/goodreads-schema.html`.
 *
 * Each field comes from one of three signed-in pages (`userUpdatedAt` from
 * the book page, or else the review page), all on
 * `https://www.goodreads.com`:
 *
 * - list page: `/review/list/<user>?shelf=%23ALL%23&per_page=100&sort=date_updated&order=d&page=<n>`,
 *   one row `tr[id^="review_"]` per entry; a row's cell is
 *   `td.field.<name> > div.value`, exactly one, or the run fails
 *   (`layout-change`). The page's title must name the user, and its sidebar
 *   (`#paginatedShelfList`) must count every exclusive shelf and every tag,
 *   each told apart by its entry's link: a `shelf` parameter (`shelf=read`)
 *   or a `tag` parameter (`tag=long-term`). Every page's sidebar must equal
 *   page 1's, every page but the last must have 100 rows, the unique books
 *   on each exclusive shelf and with each tag must equal its sidebar count,
 *   every tag on a row must be in the sidebar, and no `bookId` may be listed
 *   twice.
 * - review page: `/review/show/<id>`; its heading's shelf link
 *   (`h1 a[href*="shelf="]`), exactly one, must name an exclusive shelf, the
 *   entry's `userShelf`.
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
 * UTC: precise to the day only. `bookPublished` is the exception: a calendar
 * date, ISO 8601 with no time, at the precision shown.
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
 * A publication date in a format the list shows and `bookPublished`
 * normalizes: a day, "Nov 05, 2023"; a month, "Jan 2027"; a year, "1995",
 * "100", "-750"; "unknown". Never kept as shown.
 */
const SHOWN_PUBLISHED =
  /^((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}, )?\d{4}|-?\d{1,4}|unknown)$/;

/** Text shaped like a normalized day or month: "2023-11-05", "2027-01". */
const ISO_SHAPED = /^\d{4}-\d{2}(-\d{2})?$/;

/**
 * `bookPublished` normalized: a real day, "2023-11-05"; a month, "2027-01";
 * a year, "1995", "0100", "-0750"; `""` when unknown or the cell is empty.
 * Any other value is kept as shown.
 */
export const IsoPublished = z.union([
  z.iso.date(),
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  z.string().regex(/^-?\d{4}$/),
  z.literal(""),
]);

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
   * - Checks: its day is the day of the timeline's one "Shelved" row of the
   *   entry's own edition; when it is not, or there is not exactly one such
   *   row, a run that passes ends with a warning counting those entries
   *   (1458 of 1458 agreed on 2026-11-21).
   * - Transform: that US Pacific day, as its start in `America/Los_Angeles`,
   *   in UTC.
   * - Format: ISO 8601 UTC, precise to the day: "2026-11-01T07:00:00.000Z"
   *   (PDT), "2026-12-01T08:00:00.000Z" (PST).
   */
  userAddedAt: z.iso.datetime(),
  /**
   * The entry's shelf: Goodreads' exclusive shelf, so an entry is on one
   * and only one.
   *
   * - Page: list page.
   * - Elements: the text of the `a.shelfLink` in the `shelves` cell whose
   *   `href` has a `shelf` parameter (`?shelf=read`): exactly one, or the
   *   run fails (`parse-failure`).
   * - Checks: equal to the review page's heading shelf (`shelf-mismatch`);
   *   each shelf's unique books equal its sidebar count, the sidebar entry
   *   whose link has the same `shelf` parameter (`count-mismatch`).
   * - Transform: trimmed.
   * - Format: one of "to-read", "currently-reading", "read",
   *   "did-not-finish", "on-deck".
   */
  userShelf: z.enum(EXCLUSIVE_SHELVES),
  /**
   * The entry's tags: Goodreads' non-exclusive shelves, which its UI calls
   * tags; an entry has any number of them.
   *
   * - Page: list page.
   * - Elements: the text of each `a.shelfLink` in the `shelves` cell whose
   *   `href` has a `tag` parameter (`?tag=long-term`); a link with neither
   *   a `shelf` nor a `tag` parameter fails the run (`parse-failure`).
   * - Checks: each tag's unique books equal its sidebar count, the sidebar
   *   entry whose link has the same `tag` parameter, and every tag is in
   *   the sidebar (`count-mismatch`).
   * - Transform: each trimmed.
   * - Format: in row order, each not empty: `["long-term"]`; `[]` when the
   *   entry has none.
   */
  userTags: z.array(z.string().min(1)),
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
   * The work's original publication date, as ISO 8601 at the precision
   * shown; as shown when it is in no format below.
   *
   * - Page: list page.
   * - Elements: the text of the `date_pub` cell (not `date_pub_edition`,
   *   the edition's); "unknown" is in a `span.greyText`.
   * - Checks: a day that is not in the calendar ("Feb 30, 2023") is
   *   `parse-failure`. Text in no format below is kept as shown; a run
   *   that passes ends with a warning counting those entries (none on
   *   2026-11-21).
   * - Transform: whitespace collapsed, trimmed, then, by what it shows (as
   *   seen on the 1458 entries of 2026-11-21):
   *   - a day, "Nov 05, 2023" → "2023-11-05" (865);
   *   - a month, "Jan 2027" → "2027-01" (151);
   *   - a year of 4 digits, as it is, "1995" (306; 1000 to 2025);
   *   - a year of 1 to 3 digits, padded to 4, "100" → "0100" (2: 100, 121);
   *   - a negative year, a year BC as Goodreads gives it ("-19", _The
   *     Aeneid_, 19 BC), padded to 4, "-750" → "-0750" (11: -19 to -800).
   *     Not shifted to ISO 8601's astronomical years, where 1 BC is "0000"
   *     and "-0750" is 751 BC;
   *   - "unknown" → `""` (123);
   *   - an empty cell stays `""` (never seen).
   * - Format: a string: "YYYY-MM-DD", a real day; "YYYY-MM"; a year, "YYYY"
   *   or "-YYYY"; `""` when unknown or the cell is empty; otherwise the text
   *   as shown, never in a format above or ISO-shaped like one ("2023-02-30").
   */
  bookPublished: z.union([
    IsoPublished,
    z
      .string()
      .refine(
        (text) => !SHOWN_PUBLISHED.test(text) && !ISO_SHAPED.test(text),
        "a publication date in a known format, not normalized",
      ),
  ]),
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
 * An entry: its list page row, then its book page's work, last update,
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
   *   (`layout-change`). Not the list row's `/work/editions/<workId>` link:
   *   a row with an empty format cell has none (3 on 2026-11-21).
   * - Checks: a positive integer (`parse-failure` otherwise).
   * - Transform: the number as digits.
   * - Format: digits, "25369241"; `/work/editions/<workId>` lists its
   *   editions.
   */
  workId: z.string().regex(/^\d+$/),
  /**
   * When the user last updated the entry, best effort: close to Goodreads'
   * "date updated" (the list's sort key), not exactly it; never proof of
   * when anything changed. The file's order, the list's, sorted by
   * Goodreads' own "date updated", is the exact signal of what changed most
   * recently; this field is not.
   *
   * - Page: book page; without its value, review page.
   * - Elements: in the book page's `apolloState`, the `updatedAt` of the
   *   `Review` that the `Book`'s `viewerShelving` → `Shelving`'s `review`
   *   points to. Without it (no such `Review` or `updatedAt`: on real
   *   pages, the entries never rated or reviewed), the entry's `timeline`:
   *   its own rows (not ending in " (<format> Edition)") whose date is a
   *   whole day, "October 31, 2026".
   * - Checks: with neither, the run fails (`parse-failure`, naming the
   *   review page).
   * - Transform: `updatedAt`, milliseconds since the epoch (a positive
   *   integer), → ISO 8601; else the latest of those days, as the start of
   *   that US Pacific day in `America/Los_Angeles`, in UTC.
   * - Format: ISO 8601 UTC, of mixed precision: an exact moment, to the
   *   millisecond, from the book page, "2026-10-30T04:26:04.552Z"; a day
   *   from the timeline, "2026-10-31T07:00:00.000Z".
   * - How close, against the RSS feed's "last updated" of 2026-10-27,
   *   paired by `id`: the book page's `updatedAt` is that same Pacific day
   *   on 732 of 770 rated or reviewed entries, over a year off on 26; the
   *   timeline's day on 656 of 677 entries never rated or reviewed. In the
   *   list's order, the RSS dates were out of order 2 times in 1441
   *   adjacent pairs, `updatedAt` 17 times in 466.
   */
  userUpdatedAt: z.iso.datetime(),
  /**
   * How many times the user finished this edition: its own reads only, never
   * another edition's.
   *
   * - Page: review page; checked against the list page.
   * - Elements: the entry's `timeline`: its own rows (not ending in
   *   " (<format> Edition)") whose event is "Finished Reading".
   * - Checks: the list row's "# times read" (the hidden `read_count` cell,
   *   digits, `parse-failure` otherwise) equals it, plus 1 for a book on
   *   "currently-reading"; when it does not, a run that passes ends with a
   *   warning counting those entries (1458 of 1458 agreed on 2026-11-21). A
   *   book on "read" has at least 1; when it does not, a run that passes
   *   ends with a warning counting those books (793 of 793 had 1 or more).
   * - Transform: the number of those rows, dated or not: a book marked read
   *   with no date is read once.
   * - Format: an integer, 0 or more.
   * - Not checked, as it does not always hold (1458 entries on 2026-11-21):
   *   a finish has a date (80 undated); a finish follows its own "Started
   *   Reading" (81 do not, 80 of them undated); a "Started Reading" ends in
   *   a finish (16 do not: 9 currently reading, 7 followed by another
   *   start); both rows of a start and its finish are dated (13 are not); a
   *   book with a finish is on "read" (3 are not: 2 on-deck, 1 to-read).
   */
  userReadCount: z.number().int().min(0),
  /**
   * When the user first finished this edition, at the precision shown;
   * `""` when none of its finishes is dated, so every entry has the same
   * keys.
   *
   * - Page: review page.
   * - Elements: the dates of the entry's own "Finished Reading" rows, as in
   *   `userReadCount`; an undated one is left out.
   * - Checks: each date is a day, "October 31, 2026", a month, "February,
   *   1997", or a year, "2021" (`parse-failure` otherwise, naming the
   *   review page).
   * - Transform: each as the start of that US Pacific day in
   *   `America/Los_Angeles`, in UTC, a month padded to its 1st, a year to
   *   January 1st; the earliest.
   * - Format: ISO 8601 UTC, a day at best: "2012-11-23T08:00:00.000Z"; `""`
   *   when none is dated. Of 795 dated finishes on 2026-11-21, 793 showed a
   *   day, 1 a month, 1 a year; 28 of those days, a 1st, are only a month on
   *   the list ("Mar 2015" for "March 1, 2015"): a 1st may stand for its
   *   month.
   * - Not checked, as it does not always hold: a finish is on or after
   *   `userAddedAt` (14 of 1458 entries have one before it).
   */
  userFirstReadAt: z.union([z.iso.datetime(), z.literal("")]),
  /**
   * When the user last finished this edition, at the precision shown;
   * `""` when none of its finishes is dated. As `userFirstReadAt`, the
   * latest instead of the earliest: "2025-06-27T07:00:00.000Z"; equal to it
   * when there is one dated finish.
   */
  userLastReadAt: z.union([z.iso.datetime(), z.literal("")]),
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
