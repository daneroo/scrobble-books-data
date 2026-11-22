import type { Flow, Task } from "../flow/flow.ts";
import type { Item, ListItem } from "../goodreads.ts";
import type { PageSource } from "../pages/source.ts";
import { parseBookPage, type BookPage } from "./parse.ts";

export interface FetchBookPagesOptions {
  items: readonly ListItem[];
  source: PageSource;
  flow: Flow;
}

/**
 * Fetches and parses every book's page, at its title link (`bookURL`, no
 * redirect), in one batch through the flow controller. The result is in the
 * order of `items`.
 */
export function fetchBookPages({
  items,
  source,
  flow,
}: FetchBookPagesOptions): Promise<BookPage[]> {
  const task = ({ bookId, bookURL }: ListItem): Task<BookPage> => ({
    label: `book page ${bookId}`,
    cached: async () => (await source.has?.(bookURL)) ?? false,
    async run(signal) {
      const { body } = await source.get(bookURL, signal);
      return parseBookPage(body, bookId, bookURL);
    },
  });
  return flow.batch("book pages", items.map(task));
}

/**
 * Adds each book's work, review update, description and author, in the
 * schema's order: the work and review update before the review, the
 * description and author before the timeline. `books` is in the order of
 * `items`.
 */
export function withBookFields(
  items: readonly Omit<Item, keyof BookPage>[],
  books: readonly BookPage[],
): Item[] {
  return items.map(({ userReview, timeline, ...item }, i) => {
    const { workId, reviewUpdatedAt, bookDescription, authorName } = books[i]!;
    return {
      ...item,
      workId,
      ...(reviewUpdatedAt === undefined ? {} : { reviewUpdatedAt }),
      userReview,
      bookDescription,
      authorName,
      timeline,
    };
  });
}
