import * as cheerio from "cheerio";
import pLimit from "p-limit";
import path from "path";

import { fetchWithRetryAndTimeout } from "./fetchHelpers";
import {
  type MultipleResultsOperation,
  timeMany,
  timeOne,
} from "./timeHelpers";
import type { ReadingProgress, RSSItem } from "./types";
import { itemURL } from "./urls";

/**
 * Decorates all items with reading progress.
 * *Be careful*: This function mutates the input items.
 *
 * TODO(daneroo): remove the sequential implementation, once concurrency is proven
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

  // we have kept two implementations here, one sequential and one concurrent
  // This is in case we need to revert to sequential if concurrency is causing issues
  // *Note*: the items variable is being bound into the closure of the async function
  async function sequential(): Promise<void[]> {
    const voids: void[] = [];
    for (const item of items) {
      const v = await decorateItemWithReadingProgress(item);
      voids.push(v);
    }
    return voids;
  }
  // *Note*: the items and concurrency variables are being bound into the closure of the async function
  async function concurrent(): Promise<void[]> {
    const limit = pLimit(concurrency);
    const promises = items.map((item) => {
      return limit(async () => {
        await decorateItemWithReadingProgress(item);
      });
    });
    const voids = await Promise.all(promises);
    return voids;
  }

  const decorator: MultipleResultsOperation<void> =
    concurrency === 1 ? sequential : concurrent;

  await timeMany(decorator, (elapsed, rate, result) => {
    console.log(
      `- Decorated ${result.length} items in ${elapsed}ms  (${rate.toFixed(
        2
      )}/s concurrency:${concurrency})`
    );
  });
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
  const reviewId = reviewIdFromGuid(item.id);
  if (!reviewId) {
    //TODO(daneroo): might even throw ger?
    console.warn(`  - Skipping item with no reviewId (${reviewId})`);
    return;
  }
  // const readingProgress = await fetchReadingProgress(reviewId);
  const readingProgress = await timeOne(
    () => fetchReadingProgress(reviewId),
    (elapsed, _result) =>
      console.log(
        `  - Progress in ${elapsed}ms for ${reviewId} - ${item.authorName} - ${item.title}`
      )
  );

  item.userShelves = readingProgress.shelves.join(", ");
  // item.readCount = readingProgress.readCount.toString();
  // item.timeline = readingProgress.timeline;
  // item.progress = ...
}

function reviewIdFromGuid(guid: string): string {
  try {
    const url = new URL(guid);
    const reviewId = path.basename(url.pathname);
    return reviewId;
  } catch (e) {
    console.error(`Error parsing guid:${guid}`);
    return "";
  }
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
