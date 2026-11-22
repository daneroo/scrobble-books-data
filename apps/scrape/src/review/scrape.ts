import { ScrapeFailure } from "../failure.ts";
import type { Flow, Task } from "../flow/flow.ts";
import type { Item, ListItem } from "../goodreads.ts";
import type { PageSource } from "../pages/source.ts";
import type { BookPage } from "../book/parse.ts";
import { parseReviewPage, type ReviewPage } from "./parse.ts";

/** An entry once its review page is read: no book page fields yet. */
export type Reviewed = Omit<Item, keyof BookPage | "userUpdatedAt">;

/** A book's review page. */
export function reviewPageUrl(id: string): string {
  return `https://www.goodreads.com/review/show/${id}`;
}

export interface FetchReviewPagesOptions {
  items: readonly ListItem[];
  source: PageSource;
  flow: Flow;
}

/**
 * Fetches and parses every book's review page, in one batch through the
 * flow controller. The result is in the order of `items`.
 */
export async function fetchReviewPages({
  items,
  source,
  flow,
}: FetchReviewPagesOptions): Promise<ReviewPage[]> {
  const task = ({ id }: ListItem): Task<ReviewPage> => {
    const url = reviewPageUrl(id);
    return {
      label: `review page ${id}`,
      cached: async () => (await source.has?.(url)) ?? false,
      async run(signal) {
        const { body } = await source.get(url, signal);
        return parseReviewPage(body, id, url);
      },
    };
  };
  return flow.batch("review pages", items.map(task));
}

/**
 * Adds each book's review and timeline, once every review page's exclusive shelf
 * equals its list page's; otherwise `shelf-mismatch`, listing every book
 * that differs. `reviews` is in the order of `items`.
 */
export function withProgress(
  items: readonly ListItem[],
  reviews: readonly ReviewPage[],
): Reviewed[] {
  const mismatches = items.flatMap((item, i) => {
    const review = reviews[i]!;
    return review.exclusiveShelf === item.userExclusiveShelf
      ? []
      : [
          `book ${item.bookId} (review ${item.id}) is ${item.userExclusiveShelf} on the list page, ${review.exclusiveShelf} on its review page`,
        ];
  });
  if (mismatches.length > 0) {
    throw new ScrapeFailure({
      step: "checks",
      mode: "shelf-mismatch",
      detail: mismatches.join("; "),
    });
  }
  return items.map((item, i) => {
    const { userReview, timeline } = reviews[i]!;
    return { ...item, userReview, timeline };
  });
}
