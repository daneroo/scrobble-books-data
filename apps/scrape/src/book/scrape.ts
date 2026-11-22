import { ScrapeFailure } from "../failure.ts";
import type { Flow, Task } from "../flow/flow.ts";
import type { Item, ListItem } from "../goodreads.ts";
import type { PageSource } from "../pages/source.ts";
import { reviewPageUrl, type Reviewed } from "../review/scrape.ts";
import { latestOwnDay } from "../review/timeline.ts";
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
 * Adds each book's work, `userUpdatedAt`, description and author, in the
 * schema's order: the work, `userUpdatedAt` and the reads before the
 * review, the description and author before the timeline. `userUpdatedAt`
 * is the book page's `updatedAt`, or else the latest day of the entry's own
 * timeline rows; with neither, `parse-failure`. `books` is in the order of
 * `items`.
 */
export function withBookFields(
  items: readonly Reviewed[],
  books: readonly BookPage[],
): Item[] {
  return items.map((reviewed, i) => {
    const {
      userReadCount,
      userFirstReadAt,
      userLastReadAt,
      userReview,
      timeline,
      ...item
    } = reviewed;
    const { workId, updatedAt, bookDescription, authorName } = books[i]!;
    const userUpdatedAt = updatedAt ?? latestOwnDay(timeline);
    if (userUpdatedAt === undefined)
      throw new ScrapeFailure({
        step: "checks",
        mode: "parse-failure",
        detail: `review page ${item.id}: no updatedAt on its book page, and no day in its own timeline rows`,
        url: reviewPageUrl(item.id),
      });
    return {
      ...item,
      workId,
      userUpdatedAt,
      userReadCount,
      userFirstReadAt,
      userLastReadAt,
      userReview,
      bookDescription,
      authorName,
      timeline,
    };
  });
}
