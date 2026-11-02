/**
 * C6 (#26, #31): until cutover, every run checks the reference copy's books
 * against the list. A reference bookId not on the list (an edition switch
 * changes the bookId) does not fail the run: it is reported, with its title,
 * in a separate section of the log, to be justified in `bun run compare`.
 */
import { join } from "node:path";

import type { ListItem } from "../goodreads.ts";

/** The reference copy: the last good scrape, 2026-10-27. */
export const REFERENCE_PATH = join(
  import.meta.dir,
  "../../../../goodreads-rss-ng-2026-10-27T15.37Z.json",
);

/** The reference's books whose bookId is not in `items`. */
export async function checkReference(
  items: readonly Pick<ListItem, "bookId">[],
  referencePath: string,
): Promise<{ books: number; missing: { bookId: string; title: string }[] }> {
  const reference = (await Bun.file(referencePath).json()) as {
    items: { bookId: string; title: string }[];
  };
  const present = new Set(items.map((item) => item.bookId));
  const missing = reference.items
    .filter((book) => !present.has(book.bookId))
    .map(({ bookId, title }) => ({ bookId, title }));
  return { books: reference.items.length, missing };
}
