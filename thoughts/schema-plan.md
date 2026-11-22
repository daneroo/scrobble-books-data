# Schema Plan

## Overview

1. id: reviewId → id in goodreads.json; parsing may keep reviewId.
2. workId and multiple editions: see Multiple editions.
3. dates and timeline: the timeline is the provenance of the read dates.
   - names locked: userAddedAt, userUpdatedAt, userReadCount/First/Last;
     precision differs (day, month or year; ms), stated per field
   - timeline: semantics, and the invariants to verify
4. bookPublished: a book field, normalized; see bookPublished. May share the
   dates ticket.
5. shelf and tags: userShelf and userTags (#75).

## Multiple editions

- 28 works have two entries (two editions); 56 entries.
- workId: add it (book page `Work.legacyId`, no extra requests; not the list
  row's link, missing when the format cell is empty); pairs them exactly.
- Fallback: two entries, treated as two books. Not blocking.
- Timeline: each entry shows its own rows plus the other's
  Shelved/Started/Finished as `<event> (<format> Edition)`. All Finished rows
  are the work's reads; plain ones this entry's (20/20 same-title pairs; 8 more
  to check with workId).
- With workId: analyse the 28 case by case; fix on Goodreads where losing that
  entry's data is acceptable, if Goodreads allows it. Revisits "This cannot be
  cleaned" (#61, 2026-11-15).

## Dates and timeline

- userAddedAt: settled. Source: list "date added", a Pacific day, stored as its
  start in UTC. Timeline invariant: its one "Shelved" row has the same day
  (1458/1458).
- userUpdatedAt (#72): best effort, not exactly the sort key. Book page
  updatedAt when present; else the latest dated row of the entry's own timeline.
  Against the RSS of 2026-10-27: same day 732/770 and 656/677. The file's order
  is the exact signal.
- userReadCount, userFirstReadAt, userLastReadAt (#73): per entry, its own
  "Finished Reading" rows, dated or not; first and last from dated ones. The
  list's read_count is userReadCount + 1 on currently-reading (1458/1458).

## bookPublished

- Done (#74): a string, ISO 8601 at the precision shown: "Nov 05, 2023" →
  "2023-11-05" (865), "Jan 2027" → "2027-01" (151), "1995" (306), "-750" →
  "-0750" (11, BC as Goodreads gives it, not astronomical), "100" → "0100" (2),
  "unknown" → "" (123; owner's choice). An impossible day is parse-failure;
  other text is kept as shown, with a warning (none on 2026-11-21).

## Shelves

- Done (#75): userShelf (was userExclusiveShelf), the row's one `shelf=` link;
  userTags, its `tag=` links, `[]` when none. Shelf or tag is told by the link,
  in rows and sidebar. The 5 exclusive shelves stay a fixed list. Shelf and tag
  counts both checked against the sidebar (count-mismatch).
- Critique of Pure Reason stays tagged long-term: main's scraper fails on it
  until the merge; Docker is stopped meanwhile.
