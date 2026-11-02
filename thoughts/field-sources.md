# Sources for the 19 compatibility fields (#28)

Temporary. It feeds #29–#31 (parsers and the compatibility mapping), then it is
deleted. Approved by the user on 2026-11-02, with the decisions under
[Decisions](#decisions).

## How it was checked

Logged in locally (headless, the `apps/scrape` login) on 2026-11-01. Real pages
were saved under the gitignored `data/explore/`:

- all 15 list pages
  (`review/list/<user>?shelf=%23ALL%23&per_page=100&sort=date_added&order=d`):
  1450 rows, 1450 unique `bookId`s. That equals the sidebar sum: to-read 448,
  currently-reading 8, read 786, did-not-finish 0, on-deck 208;
- review page and book page: the spot-check books (_The Tainted Cup_, _Debt_,
  both _Essentialism_ editions) and _Time Travel_ (4.5 stars);
- book page only: _King of Thorns_ (double space in the author name) and
  _Emergency Skin_ (on-deck, title mismatch);
- review page only: _Dominion_ (has a review).

That makes 6 review pages and 7 book pages.

Each list-page source was compared with **all** 1447 books of the reference
(`goodreads-rss-ng-2026-10-27T15.37Z.json`), joined on `bookId`. All 1447 are
still on the list, plus 3 new books. Review-page and book-page sources were
compared on the sample. The raw `average_rating` comes from the 2026-10-24 RSS
XML in `data/xml/`.

_Debt_ and _The Tainted Cup_ were finished after the 2026-10-27 cutoff, so their
rating, read date, shelf and `userDateAdded` differ from the reference. They are
counted below as "2 changed", not as errors.

## Terms

- **List**: the list page row `tr#review_<reviewId>`, cells `td.field.<name>`.
- **Stored**: what `goodreads.json` keeps. It keeps the old name only when the
  meaning and format are the same.
- **Compat**: what the compatibility mapping writes to `goodreads-rss.json`.
- **Exact for scrobbleCast**: the site reads only `bookId`, `title`,
  `authorName`, `bookDescription`, `userShelves` and `userReadAt`. These six
  must equal the reference, apart from real changes on Goodreads.

## Decisions

The user's decisions, 2026-11-02:

1. **`userRating`** is one field: the list page's fractional rating (4.25, 4.5).
   There is no integer field. The compatibility mapping floors it, as the RSS
   did.
2. **No GraphQL in the scrape.** `userDateAdded` and `userDateCreated` are
   date-only, taken from the pages. The lost time of day is an approved
   difference. GraphQL may be used once, run by hand, to validate those dates in
   #31; never in the scrape.
3. **`userName`** is the first word of the full name on the list page.
4. **`averageRating`** is the all-editions average with `toFixed(1)`. The change
   of meaning is documented and approved as a difference.
5. **`bookDescription`** stays, from the book page. Caching book pages is
   decided in #31.

## Fields

### `id` and `link`

- Source: list, the `tr` id `review_<reviewId>`.
- Checked: 1447/1447. `link` equals `id` in every reference row.
- Stored: `reviewId`.
- Compat: both are
  `https://www.goodreads.com/review/show/<reviewId>?utm_medium=api&utm_source=rss`.

### `title` (exact for scrobbleCast)

- Source: list, `.field.title a[title]`, HTML-decoded. It includes the series.
- Checked: 1445/1447. Two titles changed on Goodreads:
  - _Emergency Skin_ lost its series suffix (the book page agrees with the
    list);
  - _L'heure_ became _L'Heure_ (not checked on the book page).
- Stored: `title`, unchanged.

### `bookId` (exact for scrobbleCast)

- Source: list, `.field.cover [data-resource-id]`.
- Checked: 1447/1447 (it is the join key).
- Stored: `bookId`, unchanged.

### `bookImageURL`

- Source: list, `.field.cover img[src]`, e.g. `…/28587584._SX50_.jpg`.
- Checked: 1447/1447.
- Stored: `bookImageURL`, unchanged.

### `bookDescription` (exact for scrobbleCast)

- Source: book page, `__NEXT_DATA__` → `apolloState`: the `Book` whose
  `legacyId` is the `bookId` → `description`. It is HTML (`<br />`, `<i>`).
- Checked: 7/7 exact. It isn't on the list or review page. The `/tooltips`
  endpoint has it with the HTML stripped, so that copy is lossy.
- Stored: `bookDescription`, unchanged. It costs one book page per book (see
  [Requests per run](#requests-per-run)).

### `authorName` (exact for scrobbleCast)

- Source: book page, `Book.primaryContributorEdge.node` → `Contributor.name`.
  The book page is fetched anyway, for `bookDescription`.
- Checked: 3/3, including the raw double space (`Mark  Lawrence`). The review
  page (`span[itemprop=name]`) matched 6/6, but none of those names has unusual
  spacing.
- The list is not a source. It has `Lawrence, Mark` (sort order, spaces
  collapsed, other variants), and 78/1447 differ.
- Stored: `authorName`, unchanged. Exactness over all books is checked in #31.

### `isbn`

- Source: list, `.field.isbn`, trimmed; it can be empty.
- Checked: 1447/1447.
- Stored: `isbn`, unchanged.

### `userName`

- Source: the list page `<title>`, "Daniel Lauzon’s books on Goodreads (1,450
  books)": the name before "’s books". The same on all 15 pages.
- Compat: the first word, `Daniel`. Every reference row has `Daniel`.
- Stored: `userFullName`, once per file.

### `userRating`

- Source: list, `.stars[data-rating]`, fractional: `4.5`, `4.25`, `0.0`. Six
  Math Essentials has no stars widget, which means 0.
- Checked: compat = `String(Math.floor(rating))` matches 1445/1447. The 2
  failures are the 2 changed books, rated after the cutoff: _Debt_ 4.25 → `"4"`
  and _The Tainted Cup_ 5.0 → `"5"`, where the reference has `"0"`.
- Only two books on the whole list have fractional ratings. Floor gives
  Goodreads' own integer for both: _Time Travel_ 4.5 → 4 on its review page,
  _Debt_ 4.25 → 4 on its book page. With so few cases, floor can't be told apart
  from round-half-down, but it does rule out rounding half up.
- Stored: `userRating`, a fractional number. It keeps its name by decision 1,
  although its format changes.

### `userReadAt` (exact for scrobbleCast)

- Source: list, the first `.date_read_value` (the newest read comes first):
  `Oct 24, 2026`, `Oct 2026` or `2026`.
- Checked: 1445/1447 + 2 changed, including the 73 books read more than once.
- Stored: `userReadAtText`, raw.
- Compat: `YYYY-MM-DDT00:00:00.000Z`, with a missing month or day as `01`.

### `userDateAdded`

- In the RSS it acted as "last updated". No page has it with a time.
- Source (date only, decision 2): the review page's review date,
  `.dtreviewed .value-title[title]` (`2026-10-24`).
- Checked: it equals the reference's US Pacific date for 3 of the 4 unchanged
  sample books. On the currently-reading _Essentialism_ it gives the shelving
  date instead.
- Over all 1447 reference books, the Pacific date of `userDateAdded` equals:
  - the read date for 690;
  - the shelving date for 676 (29 of them both);
  - neither for 110.

  The sample suggests the review date is the read date for read books and the
  shelving date otherwise. If so, it differs for about 156 books (11%): 94 read
  and 62 not read.

- Stored: `userDateAddedDay`, `YYYY-MM-DD` (a US Pacific calendar day).
- Compat: `YYYY-MM-DDT00:00:00.000Z`. Approved difference: the time of day for
  every book, and the date where it differs. #31 counts both and validates the
  date once by hand, with GraphQL.
- The book page's `Review.updatedAt` is not used: it is missing for unrated
  books, and the page can carry your review of another edition.

### `userDateCreated`

- Source: list, `.field.date_added span`: `Oct 22, 2026`.
- Checked: it equals the reference's US Pacific date for 1447/1447. No page has
  the time of day.
- Stored: `userDateCreatedDay`, `YYYY-MM-DD`.
- Compat: `YYYY-MM-DDT00:00:00.000Z`. Approved difference: the time of day, for
  every book.

### `userShelves` (exact for scrobbleCast)

- Source: list, `.field.shelves a.shelfLink`. Only the exclusive shelf shows:
  `read`, `to-read`, `currently-reading` or `on-deck`. No other shelves are in
  use.
- Checked: 1445/1447 + 2 changed.
- Stored: `userExclusiveShelf`.
- Compat: `""` for `read`, otherwise the shelf name.

### `userReview`

- Source: review page, `[itemprop=reviewBody]`, trimmed: full HTML text
  (`<br />`).
- Checked: 1/1 exact.
- The list also has the full text, hidden in `span#freeTextreview<id>`; that
  matched 12/12. The 2 short reviews have only `#freeTextContainer…`, which
  needs `<br/>` → `<br />` and `&apos;` → `'`.
- Stored: `userReview`, unchanged.

### `averageRating`

- Source: list, `.field.avg_rating`, e.g. `3.58`. It equals the book page's
  `Work.stats.averageRating`: the all-editions average.
- The RSS gave the edition's own average. The raw values match for 280/1447 (the
  two _Essentialism_ editions had 4.10 and 4.04; both show 4.05 now). No page
  has the edition average (`Book.stats` is `null`).
- Compat: `toFixed(1)`, as scrape-ng did to avoid commit noise. 394/1447 differ
  now: an approved difference (decision 4).
- Stored: `averageRating`, with its new meaning documented.

### `bookPublished`

- Source: list, `.field.date_pub` (the work's original publication):
  `Sep 27, 2016`, `2016`, `-550` or `unknown`.
- Checked: compat = the trailing `-?\d+`, `unknown` → `""`: 1447/1447.
  (`date_pub_edition` would differ for 755.)
- Stored: `bookPublishedText`, raw.

### `numPages`

- Source: list, `.field.num_pages`: `1,280 pp`, or empty.
- Checked: commas removed and parsed as an integer, empty → `"0"`: 1447/1447.
- Stored: `numPages`, the same string.

### `description`

- Derived, not stored. It is a fixed HTML template filled from the compat fields
  plus the list's title link `/book/show/<id>-<slug>`: 38-space indents, title
  escaped (`&amp;` `&quot;` `&#39;`), review as `review: <br/>…<br/>`.
- Checked: rebuilt exactly for 1447/1447 from the reference's own fields. That
  proves the template, not the sources.
- It inherits the differences of its inputs: `averageRating`, and the
  `userDateAdded` date ("date added: YYYY/MM/DD").

## Requests per run

For about 1450 books, measured on the pages above:

- **List pages**: 15 (N / 100), about 840 KB and 3.5–5.3 s each.
- **Review pages**: 1450 (N), about 95 KB and 0.6–0.8 s each. They are needed
  for progress (#30) anyway. Fields: `userDateAdded`, `userReview`.
- **Book pages**: **+1450 (N)**, about 380 KB and 1.0–1.8 s each, about 550 MB
  per run. Fields: `bookDescription`, `authorName`. They roughly double the
  request count and multiply the bytes by five. Caching is decided in #31.

## Seen along the way

- **Device verification.** The 6th headless login in about an hour (2026-11-01)
  got Amazon's device-verification page, so exploration stopped there. Earlier,
  one login failed with "no sign-in button" and passed on retry, and one review
  page timed out at 30 s. Log in once per run, never in a loop.
- **Book pages are a Next.js app.** They lack the `:signed_in'` marker (the
  quote is part of the string matched). The signed-in check there is
  `authContextParams.signedIn` in `__NEXT_DATA__`. Their `pageProps` also hold a
  `jwtToken` and an `apiKey`, so scrub them before using a book page as a
  fixture.
