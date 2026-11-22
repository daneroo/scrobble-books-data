# Schema Decision

- Endpoints: list row links view `/review/show/<reviewId>` and edit
  `/review/edit/<bookId>`. Edit page (dates read): analysis only.
- Section 1: settled.
- Section 2:
  - id: keep the RSS name, not reviewId.
  - userExclusiveShelf: settled.
  - userShelves: all shelves, an array; later. Open: fixed or dynamic list.
  - bookPublished: a string, normalized to ISO 8601 at the precision shown.
  - userRating: settled. A number, fractional (4.25, 4.5).
- Section 3: settled.
- Section 4: settled; dates decided below.
- Section 5: settled, all three dropped.
- Section 6:
  - bookURL: kept; can't be built from bookId.
  - bookImageURL: kept; can't be built from bookId.
  - timeline: kept as is. Later: structure, invariants.

- Naming: keep the RSS names (no book*/user* prefix on every field).
- workId: add it; 28 works have two entries, kept as two books.

## User dates (names locked; values in implementation)

- userAddedAt
- userReadCount, userFirstReadAt, userLastReadAt: per entry, from the plain
  "Finished Reading" rows (the list's read_count is this + 1 on
  currently-reading).
- userUpdatedAt (was userDateAdded): best effort; the book page's updatedAt when
  present, else the latest dated own timeline row.

Read cases:

- usual: started, progress, finished (The Diamond Age, 827, 3 reads)
- marked read, no dates (The Great Code, 318117; 61 books)
- dates added later on the edit page
