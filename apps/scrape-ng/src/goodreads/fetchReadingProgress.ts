import * as cheerio from "cheerio";
import pLimit from "p-limit";

import { fetchWithRetryAndTimeout } from "./fetchHelpers";
import type { ReadingProgress, RSSItem } from "./types";
import { itemURL } from "./urls";

/**
 * Decorates all items with reading progress.
 * *Be careful*: This function mutates the input items.
 *
 * @param items - The array of RSS items to decorate.
 * @param concurrency - The number of concurrent operations.
 * @returns A Promise that resolves when all items have been decorated.
 */
export async function decorateAllItemsWithReadingProgress(
  items: RSSItem[],
  concurrency: number
): Promise<void> {
  console.log(
    `- Decorating with reading progress for ${items.length} items (concurrency:${concurrency})`
  );
  const start = +new Date();
  if (concurrency === 1) {
    for (const item of items) {
      await decorateItemWithReadingProgress(item);
    }
  } else {
    const limit = pLimit(concurrency);
    const promises = items.map((item) => {
      return limit(async () => {
        await decorateItemWithReadingProgress(item);
      });
    });
    await Promise.all(promises);
  }
  const elapsed = +new Date() - start;
  console.log(
    `- Done in ${elapsed}ms for ${items.length} items (concurrency:${concurrency})`
  );
}
/**
 * Decorates an RSSItem with reading progress information.
 * *Be careful*: This function mutates the input item.
 * @param item - The RSSItem to decorate.
 * @returns A Promise that resolves to void.
 */
export async function decorateItemWithReadingProgress(
  item: RSSItem
): Promise<void> {
  const { reviewId } = item;
  if (!reviewId) {
    //TODO(daneroo): might even throw ger?
    console.warn(`  - Skipping item with no reviewId (${reviewId})`);
    return;
  }
  const start = +new Date();
  const readingProgress = await fetchReadingProgress(reviewId);
  const elapsed = +new Date() - start;
  console.log(
    `  - Progress in ${elapsed}ms for ${item.reviewId} - ${item.author} - ${item.title}`
  );
  item.shelves = readingProgress.shelves;
  item.readCount = readingProgress.readCount.toString();
}

export async function fetchReadingProgress(
  reviewId: string
): Promise<ReadingProgress> {
  const url = itemURL(reviewId);
  const timeout = 2000; // tested with 2000ms to be optimal
  const maxRetries = 5;

  const response = await fetchWithRetryAndTimeout(
    url,
    {},
    {
      name: `fetchReadingProgress(${reviewId})`,
      timeout: timeout,
      maxRetries: maxRetries,
    }
  );

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract shelves
  const shelves = $("span.userReview ~ a.actionLinkLite")
    .map((_, el) => {
      return $(el).text().trim();
    })
    .get(); // .get() converts Cheerio object to an array

  // Extract timeline
  const timeline = $(".readingTimeline .readingTimeline__row")
    .map((_, row) => {
      //  sometimes the date is missing, so we need to split on the first dash
      // the dash is actually an &ndash;
      // Finished Reading   (Paperback Edition)
      // April 28, 2013 – Shelved as: to-read  (Paperback Edition)
      // April 28, 2013 – Shelved  (Paperback Edition)
      // December 27, 2019 –  Started Reading
      // December 27, 2019 – Shelved
      // January  2, 2020 –  Finished Reading
      // March  1, 2024 –  Started Reading
      // March  2, 2024 –    13.0%
      // March  3, 2024 –    25.0%
      // March  4, 2024 –    53.0%
      // March  6, 2024 –    75.0%
      // March  7, 2024 –  Finished Reading
      const fullText = $(row)
        .find(".readingTimeline__text")
        .text()
        .replace(/\n/g, " ")
        .trim();
      const ndash = "–"; // &ndash; html entity
      const parts = fullText.split(ndash, 2).map((part) => part.trim());
      if (parts.length === 1) {
        return { date: "January 1, 1970", event: parts[0] };
      }
      const [date, event] = parts;
      return { date, event };
    })
    .get(); // Convert Cheerio object to an array

  // console.log(`    - timeline ${timeline.length} events`);
  // timeline.forEach((event) => {
  //   console.log(`      - ${event.date}: ${event.event}`);
  // });

  // test if event starts with Finished Reading
  // it can contain other notes: "Finished Reading   (Paperback Edition)",
  const readCount = timeline.filter((event) =>
    event.event.startsWith("Finished Reading")
  ).length;

  const readingProgress: ReadingProgress = {
    reviewId,
    shelves,
    timeline,
    readCount,
  };

  return readingProgress;
}
