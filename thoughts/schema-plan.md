# Schema Plan

## Overview

1. id: reviewId → id in goodreads.json; parsing may keep reviewId.
2. workId and multiple editions: see Multiple editions.
3. dates and timeline: the timeline is the provenance of the read dates.
   - names locked: userAddedAt, userUpdatedAt, userReadCount/First/Last;
     precision differs (day, month or year; ms), stated per field
   - timeline: semantics, and the invariants to verify
   - bookPublished: related, independent: keep as shown, or normalize
4. shelves: userShelves, every shelf, an array; fixed or dynamic list.

## Multiple editions

- 28 works have two entries (two editions); 56 entries.
- workId: add it (list row, no extra requests); pairs them exactly.
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
- userUpdatedAt: book page updatedAt when present (770/1447), definitive.
  Fallback for the rest: review page header date or latest dated timeline row
  (both always present); the definitive analysis is done in implementation.
- userReadCount, userFirstReadAt, userLastReadAt: one group, implemented
  together, per entry (plain "Finished Reading" rows). Invariants: the
  definitive analysis is done in implementation.
  - entry point: Finished Reading
  - unmatched / undated / missing Started Reading / Finished Reading pairs

## Shelves

- userShelves: every shelf on the row, an array; userExclusiveShelf: the one
  that is exclusive.
- Exclusive list: from the sidebar (above the divider), not hard-coded? Open.
- Test: put one real book on a non-exclusive shelf, save the list page, parse it
  offline first.
- Rollout order: the code that accepts several shelves ships first; then add
  books to non-exclusive shelves. The other way round, every cron run fails
  (nothing published).
