import * as cheerio from "cheerio";

import { fetchWithTimeout } from "./fetchWithTimeout";
import type { ReadingProgress } from "./types";
import { itemURL } from "./urls";

export async function fetchReadingProgress(
  reviewId: string
): Promise<ReadingProgress> {
  const url = itemURL(reviewId);
  const timeout = 2000; // tested with 2000ms to be optimal
  const response = await fetchWithTimeout(url, {}, timeout);
  if (!response.ok) {
    console.debug(`- response:${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch page: ${url}`);
  }
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
      const fullText = $(row)
        .find(".readingTimeline__text")
        .text()
        .replace(/\n/g, " ")
        .trim();
      const [date, event] = fullText.split("–").map((part) => part.trim());
      return { date, event };
    })
    .get(); // Convert Cheerio object to an array

  const readingProgress: ReadingProgress = {
    reviewId,
    shelves,
    timeline,
  };

  return readingProgress;
}
