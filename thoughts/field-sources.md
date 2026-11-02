# Sources for the 19 compatibility fields (#28)

Temporary. Once approved, this feeds the parser and compatibility-mapping
tickets, and this file is deleted.

**How it was checked.** Logged in locally (headless, `apps/scrape` login) on
2026-11-01 and saved real pages under the gitignored `data/explore/`:

- all 15 list pages
  (`review/list/<user>?shelf=%23ALL%23&per_page=100&sort=date_added&order=d`):
  1450 rows, 1450 unique `bookId`s, equal to the sidebar sum (to-read 448,
  currently-reading 8, read 786, did-not-finish 0, on-deck 208);
- the three spot-check books (_The Tainted Cup_, _Debt_, both _Essentialism_
  editions) and _Time Travel_ (4.5 stars): review page and book page each;
- _King of Thorns_ (double space in the author name) and _Emergency Skin_
  (on-deck, title mismatch): book page only;
- _Dominion_ (has a review): review page only;
- one batched `/tooltips` response for the 7 books with a book page.

That is 6 review pages and 7 book pages.

Each list-page source was compared with **all** 1447 reference books
(`goodreads-rss-ng-2026-10-27T15.37Z.json`), joined on `bookId`: every reference
book is still on the list, plus 3 new ones. Review-page and book-page sources
were compared on the sample. The 2026-10-24 RSS XML in `data/xml/` gave the raw,
unrounded `average_rating`.

**Changed since the cutoff, not scraper errors:** _Debt_ and _The Tainted Cup_
were finished after 2026-10-27, so their rating, read date, shelf and
`userDateAdded` differ from the reference. They are left out of the counts below
as "2 changed".

## The table

"List" is the list page row `tr#review_<reviewId>`, cells `td.field.<name>`.
"Equal" means the value found equals the reference value with no change, so
`goodreads.json` keeps the old name. A "mapping" means the format differs:
`goodreads.json` stores the value found under a new name (proposed in the last
column), and the compatibility mapping derives the old field from it ("compat"
below). "Derived" fields are built by the mapping and not stored at all.

| Field             | Source                                                                                                                                 | Format found                                                                    | Checked                                                                                                                                                                                                                                                                | Equal or mapping                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`              | List: `tr` id `review_<reviewId>`                                                                                                      | `9047081205`                                                                    | 1447/1447                                                                                                                                                                                                                                                              | Mapping: `reviewId`; compat = `https://www.goodreads.com/review/show/<reviewId>?utm_medium=api&utm_source=rss`   |
| `link`            | Same as `id`                                                                                                                           | same                                                                            | 1447/1447 (`link` = `id` in every reference row)                                                                                                                                                                                                                       | Derived from `reviewId`, as `id`                                                                                 |
| `title`           | List: `.field.title a[title]`, HTML-decoded                                                                                            | `Time Travel: A History` (series included)                                      | 1445/1447; _Emergency Skin_ lost its series suffix on Goodreads (book page agrees with the list); _L'heure_ → _L'Heure_ (case changed, not checked on the book page)                                                                                                   | Equal                                                                                                            |
| `bookId`          | List: `.field.cover [data-resource-id]`                                                                                                | `28587584`                                                                      | 1447/1447 (join key)                                                                                                                                                                                                                                                   | Equal                                                                                                            |
| `bookImageURL`    | List: `.field.cover img[src]`                                                                                                          | `…/28587584._SX50_.jpg`                                                         | 1447/1447                                                                                                                                                                                                                                                              | Equal                                                                                                            |
| `bookDescription` | Book page: `__NEXT_DATA__` → `apolloState` `Book` with `legacyId` = `bookId` → `description`                                           | HTML (`<br />`, `<i>`)                                                          | 7/7 exact. Not on the list or review page; the tooltip has it with the HTML stripped (lossy)                                                                                                                                                                           | Equal; **costs one book page per book** (see request counts)                                                     |
| `authorName`      | Review page: `span[itemprop=name]`; or book page `Contributor.name`; or tooltip `a.authorName`                                         | `James Gleick`; raw spacing kept (`Mark  Lawrence`) on book page and tooltip    | Book page 3/3, including the double-space case; tooltip 1/1 (that case); review page 6/6, but none of the 6 has unusual spacing, so raw spacing there is **not verified**. The list has `Lawrence, Mark` (sort name, spaces collapsed, other variants): 78/1447 differ | Equal from the book page. Review page: likely, to verify. The list value would be a new field (`authorSortName`) |
| `isbn`            | List: `.field.isbn`, trimmed                                                                                                           | `0307908801` or empty                                                           | 1447/1447                                                                                                                                                                                                                                                              | Equal                                                                                                            |
| `userName`        | Review page: `meta[name=description]` "… is on **Daniel**’s read shelf …"                                                              | first name                                                                      | 5/6 review pages. On _Dominion_, a reviewed book, the meta description is the review text instead. Every reference row has `Daniel`                                                                                                                                    | Equal, but see gap 3                                                                                             |
| `userRating`      | Review page: `meta[itemprop=ratingValue]`; or book page `Review.rating` (via `viewerShelving`, see gap 1). List: `.stars[data-rating]` | review/book page: integer `4`; list: fractional `4.5`, `4.25`                   | List, floored: 1445/1447 + 2 changed; only one fractional value (4.5 → `4`) among unchanged books. Review page `4` for _Time Travel_; book page `4` for _Debt_ (4.25)                                                                                                  | Equal from review page. Fractional rating is new data: `userRatingFractional`                                    |
| `userReadAt`      | List: first `.date_read_value` (newest read first)                                                                                     | `Oct 24, 2026`, `Oct 2026`, `2026`                                              | 1445/1447 + 2 changed, including the 73 books read more than once                                                                                                                                                                                                      | Mapping: `userReadAtText` (raw); compat = `YYYY-MM-DDT00:00:00.000Z`, missing month/day → `01`                   |
| `userDateAdded`   | **No full source found**                                                                                                               | —                                                                               | Book page `Review.updatedAt` (ms), followed from `viewerShelving.review`: exact to the second for 2 of 3 unchanged books, 1.1 s off for the third, and null for books with no rating or review (on-deck, currently-reading)                                            | **Gap 1**                                                                                                        |
| `userDateCreated` | List: `.field.date_added span` (date only)                                                                                             | `Oct 22, 2026` = the US Pacific date of the reference timestamp                 | Date: 1447/1447. Time of day: no source                                                                                                                                                                                                                                | **Gap 2**; the date alone is a mapping: `userDateCreatedDay`                                                     |
| `userShelves`     | List: `.field.shelves a.shelfLink` (only the exclusive shelf appears; no other shelves are used)                                       | `read`, `to-read`, `currently-reading`, `on-deck`                               | 1445/1447 + 2 changed                                                                                                                                                                                                                                                  | Mapping: `userExclusiveShelf`; compat = `""` for `read`, else the name                                           |
| `userReview`      | Review page: `[itemprop=reviewBody]`, trimmed. Also list: hidden `span#freeTextreview<id>`                                             | HTML (`<br />`), full text                                                      | Review page 1/1 exact. List 12/12: full span exact for 10; the 2 short reviews have only `#freeTextContainer…`, which needs `<br/>`→`<br />` and `&apos;`→`'`                                                                                                          | Equal from review page                                                                                           |
| `averageRating`   | List: `.field.avg_rating` (= book page `Work.stats.averageRating`)                                                                     | `3.58`: the **all-editions** average                                            | Raw: 280/1447 equal to the RSS value. Rounded with `toFixed(1)` as scrape-ng did: 394/1447 differ. The two _Essentialism_ editions had 4.10 and 4.04 in the RSS, both 4.05 now                                                                                         | **Gap 4**: different meaning                                                                                     |
| `bookPublished`   | List: `.field.date_pub`, trailing year `-?\d+`; `unknown` → `""`                                                                       | `Sep 27, 2016`, `2016`, `-550`, `unknown`                                       | 1447/1447 (`date_pub_edition` would differ for 755)                                                                                                                                                                                                                    | Mapping: `bookPublishedText` (raw); compat = the year                                                            |
| `description`     | Derived from the compat fields plus the list title link `/book/show/<id>-<slug>`                                                       | fixed HTML template, 38-space indents, title escaped (`&amp;` `&quot;` `&#39;`) | Template checked: rebuilt exactly for 1447/1447 from the reference's own fields plus the live slug. So it proves the template, not the sources                                                                                                                         | Derived. Every input feeds it, so gaps 1, 3 and 4 and the `authorName` source all show up here too               |
| `numPages`        | List: `.field.num_pages`, commas removed, integer; empty → `0`                                                                         | `1,280 pp`                                                                      | 1447/1447                                                                                                                                                                                                                                                              | Mapping: `pageCount` (a number); compat = the string                                                             |

## Gaps to decide

1. **`userDateAdded`** (in the RSS, it acted like "last updated": it changes
   when a book is finished). Nothing on the list, review or book pages gives it
   for every book. The review page's `datePublished` gives the right date for
   read books, but the created date for a currently-reading one. Options:
   - **a.** Goodreads' private GraphQL API, which the book page itself calls
     with a token found in the page. Its schema has `Review.updatedAt` and
     `createdAt`. Not tried: it's an undocumented API and your call.
   - **b.** Book page `Review.updatedAt` where it exists, and a new field name.
     Not exact (1.1 s off once) and missing for unrated books. It must be
     followed from `Book.viewerShelving.review`: the book page also carries your
     review of _another edition_ (the currently-reading _Essentialism_ page
     holds the 2023 review of the other edition, rating 4), so looking up "your
     review" by user gives the wrong edition's values.
   - **c.** Change the meaning: e.g. use the latest timeline date (date only).
     That would be a new field and an approved difference for every book.
2. **Time part of `userDateCreated`.** Only the US Pacific date exists on the
   pages. Option a above (`Review.createdAt`, if it is the shelving time) may
   have it. Otherwise the compat value needs an approved change of format (e.g.
   Pacific midnight), which would differ for every book.
3. **`userName`.** It's only found in the text of the review page's meta
   description, and only on pages without a review: on a reviewed book that meta
   holds the review text. A structured source wasn't found: the list and book
   pages only have the full name ("Daniel Lauzon"). Options: parse that meta
   text from one unreviewed book's page (the value is the same for every book),
   or a setting for the account's first name.
4. **`averageRating`.** The RSS gave the edition's average; the pages give the
   all-editions average (list = book page `Work.stats`). The edition average
   wasn't found on the list, review or book page (`Book.stats` is `null`). Not
   checked: the work's editions page (`/work/editions/<workId>`), which may list
   per-edition averages. Proposal (as #23 allows): keep `averageRating`, with
   its new meaning "all-editions average, rounded with `toFixed(1)`",
   documented. That is an approved difference for about 394 books now.

## Extra requests per run (input to the request limits)

For about 1450 books, measured on the pages above:

| Page        | Requests      | Size, time each    | Fields it is the source of                                                                                                                                                           |
| ----------- | ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| List page   | 15 (N / 100)  | ~840 KB, 3.5–5.3 s | `id`, `link`, `title`, `bookId`, `bookImageURL`, `isbn`, `userReadAt`, `userDateCreated` (date), `userShelves`, `averageRating`, `bookPublished`, `numPages`, slug for `description` |
| Review page | 1450 (N)      | ~95 KB, 0.6–0.8 s  | `authorName`, `userRating`, `userReview`, `userName`; already needed for progress, so no extra                                                                                       |
| Book page   | **+1450 (N)** | ~380 KB, 1.0–1.8 s | `bookDescription` only (≈550 MB per run)                                                                                                                                             |
| `/tooltips` | +29 (N / 50)  | ~5 KB per book     | not needed; author name with raw spacing, if review pages were ever dropped                                                                                                          |

So the book pages roughly double the request count and multiply the bytes by
about five. Caching book pages by `bookId` between runs would cut that, but it's
a design decision, not part of this ticket.

## Seen along the way

- **Device verification.** The 6th headless login in about an hour (2026-11-01,
  local) got Amazon's device-verification page, so exploration stopped there.
  One earlier login failed once with "no sign-in button" and passed on retry.
  One review page (_Cosmological Koans_) timed out at 30 s; it was not retried.
  Input for the login and retry tickets: log in once per run, never in a loop.
- **Book pages are a Next.js app.** They have no `:signed_in'` marker; the
  signed-in check there is `authContextParams.signedIn` in `__NEXT_DATA__`.
  Their `pageProps` also carry a `jwtToken` and an `apiKey`, so saved book pages
  must be scrubbed before use as fixtures.
- **Six Math Essentials** (on-deck) has no rating widget on the list
  (`data-rating` missing); the reference has `0`.
