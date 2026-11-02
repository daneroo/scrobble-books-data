/**
 * C6 (#26, #31): until cutover, every run checks that every book of the
 * reference copy is still on the list. Zero tolerance, no override: any
 * missing book fails the run as `unexpected-shrink`, listing each one.
 */
import { join } from "node:path";

import { ScrapeFailure } from "../failure.ts";
import type { ListItem } from "../goodreads.ts";

/** The reference copy: the last good scrape, 2026-10-27. */
export const REFERENCE_PATH = join(
  import.meta.dir,
  "../../../../goodreads-rss-ng-2026-10-27T15.37Z.json",
);

/** Fails as `unexpected-shrink` if a reference book is not in `items`. */
export async function checkReference(
  items: readonly Pick<ListItem, "bookId">[],
  referencePath: string,
): Promise<{ books: number }> {
  const reference = (await Bun.file(referencePath).json()) as {
    items: { bookId: string; title: string }[];
  };
  const present = new Set(items.map((item) => item.bookId));
  const missing = reference.items.filter((book) => !present.has(book.bookId));
  if (missing.length > 0) {
    throw new ScrapeFailure({
      step: "checks",
      mode: "unexpected-shrink",
      detail: `${missing.length} of the reference's ${reference.items.length} books are missing: ${missing
        .map(({ bookId, title }) => `${bookId} (${title})`)
        .join(", ")}`,
    });
  }
  return { books: reference.items.length };
}
