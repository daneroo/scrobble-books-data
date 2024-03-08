import * as cheerio from "cheerio";

import type { FetchOptions, ReviewItem, ScrapingContext } from "../types";

/**
 * Creates a scraping context based on the provided fetch options for the html(cheerio) engine.
 * @param fetchOptions - The options for fetching the review items.
 * @returns A promise that resolves to a scraping context.
 */
export async function createContext(
  fetchOptions: FetchOptions
): Promise<ScrapingContext> {
  // Cheerio context setup if needed; e.g., initializing with global options or cookies

  return {
    cleanup: async () => {
      // Scraping context cleanup (no actions necessary for html/Cheerio context)
    },
    fetchReviewItemsInPage: async (url: string) => {
      return fetchReviewItemsInPage(url);
    },
  };
}

/**
 * Fetches review items from a given Goodreads reviews page.
 * helper for implementing the ScrapingContext.fetchReviewItemsInPage method
 * @param page - Playwright Page object for browser automation.
 * @param url - The URL to fetch the review items from.
 * @returns A promise that resolves to an array of ReviewItem objects.
 */
async function fetchReviewItemsInPage(url: string): Promise<Array<ReviewItem>> {
  const response = await fetch(url);
  if (!response.ok) {
    console.debug(`- response:${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch page: ${url}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const items = $("#booksBody") // this is a tbody
    .find("tr")
    .map((_, row) => {
      // Extract the ID from the row's attributes (not $row)
      // this gets typed wrong, it should be string|undefined, but TS thinks it's string
      // const id = (row as cheerio.TagElement).attribs.id as string | undefined;
      // but I will let it slide and validate the whole output later
      //  Casting to TagElement is safe because <tr>, and necessary to access the attribs property
      const id = (row as cheerio.TagElement).attribs.id;
      const reviewId = id.split("_")?.[1] ?? "";

      // Extract title, author, and readCount using Cheerio selectors
      const title = $(row).find(".field.title a").text().trim();
      const author = $(row).find(".field.author a").text().trim();
      const readCount = $(row).find(".field.read_count .value").text().trim();

      // For dateStartedValues and dateReadValues, use Cheerio to find and map the
      const dateStartedValues = $(row)
        .find(".field.date_started .date_started_value")
        .map((idx, el) => $(el).text().trim())
        .get() as string[];

      const dateReadValues = $(row)
        .find(".field.date_read .date_read_value")
        .map((idx, el) => $(el).text().trim())
        .get() as string[];

      // Construct and log the object with the extracted data
      const item = {
        id,
        reviewId,
        title,
        author,
        readCount,
        dateStartedValues,
        dateReadValues,
      } as ReviewItem;
      // console.log(`- Item: ${JSON.stringify(item)}`);
      return item;
    })
    .get() as ReviewItem[]; // convert back to a regular

  // TODO(daneroo): need a runtime validation of items: ReviewItem[]

  return items;
}
