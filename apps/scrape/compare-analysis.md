# Compare analysis: every difference, justified

Reference: `goodreads-rss-ng-2026-10-27T15.37Z.json` (1447 books, the cutoff).
Output: `goodreads-rss.json` from the 09:06 run on 2026-11-02 (1450 books).
Source of the counts: `apps/scrape/compare.txt` (`bun run compare`).

Status per group: **accepted** (reason checked against data), **open** (needs a
decision), **fix** (the comparison or mapping must change).

Current compare (with the date rule): 130 explained date differences, 1022
unexplained fields in 549 books. All groups are accepted by the user
(2026-11-02).

## 1. Books: changed, new, moved

- **bookId changed: accepted.** Edition switched by the user, 2026-11-02.
  Proven: after the switch, the list row links to
  `/book/show/252111820-saving-byzantium`.
  - Saving Byzantium: 229141546 → 252111820
  - The Cambridge History of the Polar Regions: 61421309 → 78278039
- **New: accepted.** Added after the cutoff.
  - Scion (created 2026-10-28)
  - The Power Broker (2026-10-30)
  - A Drop of Corruption (2026-11-01)
- **Moved: accepted.** The Tainted Cup, finished 2026-10-31; the list is sorted
  by last updated.
- **Moved: accepted.** Saving Byzantium and Polar Regions, now positions 1 and
  2: switching an edition counts as an update. Compare reports 3 moved books;
  section 8 also checks the order independently.
- **Fields of the 2 switched books: accepted.** Compare now compares paired
  books. Each difference is the new edition's own data:
  - Saving Byzantium: bookId; bookImageURL (no photo → a cover); isbn 139812219X
    → ""; averageRating 0.0 → 5.0 (section 3).
  - Polar Regions: bookId; bookImageURL (no photo → a cover); isbn 1108555659 →
    1108429939; numPages 0 → 850; averageRating 0.0 → 5.0 (section 3).

## 2. Changed on Goodreads after the cutoff: accepted

- **Debt 6617037**, finished 2026-10-29: userRating 0 → 4; userReadAt →
  2026-10-29; userShelves currently-reading → "" (the reference writes the read
  shelf as ""); userDateAdded.
- **The Tainted Cup 150247395**, finished 2026-10-31: userRating 0 → 5;
  userReadAt → 2026-10-31; userShelves on-deck → ""; userDateAdded.
- **L'heure des prédateurs 222728117**, renamed on Goodreads: title → "L'Heure
  des prédateurs".
- **Emergency Skin 49669410**, renamed on Goodreads: the series suffix "(Forward
  Collection, #3)" dropped.

## 3. averageRating: 394 books, accepted

- **Proven: the reference has the edition's own average; the output has the
  work's (all editions) average.** The editions list
  (`/work/editions/2212225-genji-monogatari`, fetched signed in, 2026-11-02)
  shows _The Tale of Genji_ 36334182 at 3.28 (216 ratings) and _The Tale of
  Gengi_ 170128323 at 3.36 (11 ratings): the reference's 3.3 and 3.4 exactly.
  Both now show the work's 3.71.
- Every edition's book page shows the work's average, so checking edition pages
  on the site can't show the edition value.
- The two 5.0 deltas, from the editions lists (fetched signed in, 2026-11-02):
  the single rating (5) is on another edition, and the reference edition has 0
  ratings, so its own average is the reference's 0.0.
  - Saving Byzantium: 229141546 (reference) 0.0, 0 ratings; 247923113 5.00, 1
    rating; 252111820 (switched to) 0.0, 0 ratings.
  - Polar Regions: 61421309 (reference) 0.0, 0 ratings; 78278039 (switched to)
    5.00, 1 rating; 137801530 0.0, 0 ratings.
- Consistent with it: The Odyssey (1.3 M ratings) differs by 0.3, which no
  recent change could cause.
- Histogram of abs(delta), rounded to 0.1, from `apps/scrape/compare.txt`:

  | abs(delta) | Books                  |
  | ---------- | ---------------------- |
  | 0.1        | 345                    |
  | 0.2        | 25                     |
  | 0.3        | 14                     |
  | 0.4        | 3                      |
  | 0.5        | 3                      |
  | 0.6        | 1                      |
  | 0.9        | 1 (White Jacket)       |
  | 5.0        | 2 (the switched books) |
  | **Total**  | **394**                |

- **Accepted, all 394 at once (user, 2026-11-02):** the reference has each
  edition's own average, the output the work's average over all editions; proven
  on 4 books above. Each delta is how far that edition's average is from its
  work's.
- Not done: fetching the editions list to publish the edition's own average (one
  page per work, about 1450 more requests per run).

## 4. Dates: how compare reads them; userDateCreated and userReadAt

The compare rule (2026-11-02) compares the three date fields as days:

- `userDateCreated`, `userDateAdded`: the reference has real moments (none of
  1447 is at midnight UTC), read as their `America/Los_Angeles` day.
- `userReadAt`: the reference has day labels (all 724 are midnight UTC), read as
  their first 10 characters, no conversion.
- The output side: its first 10 characters (the day the page shows).
- A difference is explained, in this order: changed after the cutoff (either day
  after 2026-10-27); for `userDateAdded` only, a timeline event in
  `goodreads.json` dated the reference's day. Explained ones are listed with
  their reason in their own section of `apps/scrape/compare.txt`.

Results:

- `userDateCreated`: 0 differences. The time of day is lost (approved in #28).
  **Accepted.**
- `userReadAt`: 2, both changed after the cutoff (Debt, The Tainted Cup).
  **Accepted.**
- Storage format of dates, and proving each field's meaning with a test book:
  #34 review items.

## 5. userDateAdded: 186 books on another day

- In the RSS it meant "last updated". The output uses the review page's date
  (#28), which is not that: e.g. _Cryptonomicon_, reference 2025-02-12 (the
  reread), output 2011-11-05 (first shelved).
- Confirmed again: switching the two editions moved both books to the top of the
  last-updated order, but their review-page date didn't change.
- 2 of the 186 are later (Debt, The Tainted Cup: section 2). 184 earlier, 112 by
  more than a year.
- Candidate: the latest dated timeline entry matches 1360 of 1447 (87 differ),
  against 1261 for the review page's date. Not exact; no page shows "last
  updated". scrobbleCast doesn't read this field.
- **Kept as the review page's date for the merge** (user, 2026-11-02); candidate
  recorded on #34.
- Each of the 186, against the book's own timeline in `goodreads.json`:
  - 2 changed after the cutoff (Debt, The Tainted Cup).
  - 126 have a timeline event on the reference's day (finished reading 79,
    shelved 44, a progress update or started reading 3): the reference's "last
    updated" is that event.
  - 58 have no timeline event on the reference's day: no page explains them. 38
    are rated read books; 9 share 2013-01-16 and 5 share 2012-02-04, which
    suggests bulk edits (ratings or reviews, which the timeline doesn't show).
    Unproven.
- In compare: the 128 are explained (2 after the cutoff, 126 timeline event);
  the 58 are listed as unexplained. Status: **accepted** (user, 2026-11-02): a
  compat-only problem; the old field meant "last updated", which no page shows.

## 6. bookDescription: 25 books, accepted (58 before the fixes)

Fixed: 13 whitespace-only (trim, S4); 33 links (the reference adds
`rel="nofollow noopener"` to links without rel; the mapping now does too).

The 25 left: the output is exactly what the book page shows today. Evidence: the
differing part of each, "was" (reference) → "now" (output), from
`apps/scrape/compare.txt`, shown to the user in full before the decision.

- **Text added, rewritten or reformatted on Goodreads**, 15:
  - 1873 (241125423): adds " • Named a Best Book of the Year by Publishers
    Weekly".
  - The Nerd Reich (244382759): the opening quote changed ("This transfixing
    debut…" → "A haunting picture of the political project…").
  - The Last Contract of Isako (123163998): "from the author of the modern
    fantasy classic Jade City" removed.
  - The Proof in the Code (241374208): adds "One of Publishers Weekly's Best
    Books of 2026".
  - Beyond the Quantum (232967492): adds "MP3 CD Format"; text in bold.
  - American Happiness and Discontents (57094553): same text, now in bold.
  - Writing to Learn (585474): one sentence → that sentence in bold plus a
    longer description.
  - Asteroid Hunters (30753762): same text, now in bold.
  - The Beauty of Falling (199701467): same text, now in bold.
  - The Equation That Couldn't Be Solved (233873): spacing around line breaks.
  - Adventures in Group Theory (4996537): a space → a paragraph break.
  - The Tragedy of Liberation (17287091): bold, and the cited title in italics.
  - Market Tremors (59015075): a double space → a paragraph break.
  - Practical NATS (40531754): "Practical NATS" in italics.
  - A Short Border Handbook (3161679): wrapped in a double bold tag.
- **Description now in another language**, 2. Both shelved editions are English
  editions (book page language: English); the wrong-language text is Goodreads'
  data. The user chose not to switch editions:
  - The Everlasting (225699786, Tor Books hardcover): English → Spanish.
  - The Sword of Kaigen (41886271, Kindle edition): English → Italian.
- **Link or image in the reference, plain text on the page now**, 7:
  - What Is a Quantum Field Theory? (59143221): link →
    "michel.talagrand.net/erratum.pdf".
  - Encyclopedia of Mathematical Physics (1112346): link →
    "www.info.sciencedirect.com".
  - Quantum Paradoxes (784381): link → "www.wiley-vch.de/supplements/".
  - Covariant Loop Quantum Gravity (22575601): link → a shortened URL ending
    "...".
  - Paperless (13641406): link → a shortened URL ending "...".
  - The Hope of Elantris (10852065): "annotation" link → the word only.
  - Why We Get Fat (8727466): an `<img>` → the text "[image]".
- **Protocol**, 1:
  - The Pillars of the Earth (5043): a Goodreads link `https://` → `http://`.

Status: **accepted, all 25** (user, 2026-11-02, after reviewing the list above).
`goodreads-rss.json` publishes what the book page shows today; 2 books get a
non-English blurb and 7 lose a link or image.

## 7. description: 532 books

The RSS summary block (cover link, then author, name, average rating, book
published, rating, read at, date added, shelves, review), not the blurb. Built
only from other fields. All 532 differences come from parts whose source field
already differs (section 8), so it adds none of its own. Its status follows the
fields above.

## 8. Independent checks (coordinator, 2026-11-02)

Run on `goodreads-rss.json` and the reference directly, without the compare
code:

- Same keys: the top level (`title`, `items`) and all 19 item fields are the
  same in both; the top-level `title` is equal.
- Compare covers every field: it compares the union of both items' keys.
- The 898 reference books with no listed difference are identical, field by
  field (dates as the US Pacific day).
- Order: with The Tainted Cup and the 2 switched books set aside, the other 1444
  reference books are in exactly the reference's order. The output starts: Polar
  Regions, Saving Byzantium, A Drop of Corruption, The Tainted Cup, The Power
  Broker.
- description: all 532 differences come only from the parts built from other
  differing fields: average rating 394, date added 186, rating 2, read at 2,
  shelves 2, and the link and cover header 4 (the 2 switched books, the 2
  renamed titles). Nothing else differs.

Not checked against the reference: the `goodreads.json` data that is not mapped
into `goodreads-rss.json` (the timeline, apart from the finish dates that now
give `userReadAt`, and the fractional rating). Only CUE and zod check them.
