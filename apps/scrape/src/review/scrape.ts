import { ScrapeFailure } from "../failure.ts";
import type { Flow, Task } from "../flow/flow.ts";
import type { Item, ListItem } from "../goodreads.ts";
import type { PageSource } from "../pages/source.ts";
import { parseReviewPage, type ReviewPage } from "./parse.ts";

/** A book's review page. */
export function reviewPageUrl(reviewId: string): string {
  return `https://www.goodreads.com/review/show/${reviewId}`;
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
  const task = ({ reviewId }: ListItem): Task<ReviewPage> => {
    const url = reviewPageUrl(reviewId);
    return {
      label: `review page ${reviewId}`,
      async run(signal) {
        const { body } = await source.get(url, signal);
        return parseReviewPage(body, reviewId, url);
      },
    };
  };
  return flow.batch("review pages", items.map(task));
}

/**
 * Adds each book's timeline, once every review page's exclusive shelf
 * equals its list page's; otherwise `shelf-mismatch`, listing every book
 * that differs. `reviews` is in the order of `items`.
 */
export function withProgress(
  items: readonly ListItem[],
  reviews: readonly ReviewPage[],
): Item[] {
  const mismatches = items.flatMap((item, i) => {
    const review = reviews[i]!;
    return review.exclusiveShelf === item.userExclusiveShelf
      ? []
      : [
          `book ${item.bookId} (review ${item.reviewId}) is ${item.userExclusiveShelf} on the list page, ${review.exclusiveShelf} on its review page`,
        ];
  });
  if (mismatches.length > 0) {
    throw new ScrapeFailure({
      step: "checks",
      mode: "shelf-mismatch",
      detail: mismatches.join("; "),
    });
  }
  return items.map((item, i) => ({ ...item, timeline: reviews[i]!.timeline }));
}
