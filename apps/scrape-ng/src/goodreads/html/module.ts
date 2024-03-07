import * as cheerio from "cheerio";

import { executeWithRetry } from "../retry";
import type { FetchOptions, ReviewItem } from "../types";
import type { ListParams } from "../urls";
import { shelfIterator } from "../urls";

/**
 * Fetches all review items from Goodreads.
 *  HTML-specific implementation (using Cheerio)
 *
 * Iterates over review pages for a given shelf/per_page
 * and accumulates items from each page.
 * Also performs retry logic for each page.
 *
 * @param credentials - The credentials object containing user credentials.
 * @param listOptions - The parameters for iterating through the list of review items.
 * @returns A promise that resolves to an array of review items.
 */
export async function fetchAllReviewItems(
  fetchOptions: FetchOptions
): Promise<Array<ReviewItem>> {
  const { credentials, listOptions } = fetchOptions;

  const maxPages = 100;
  const maxRetries = 5;

  const allItems: ReviewItem[] = [];

  for await (const { url, urlParams } of shelfIterator(
    credentials.GOODREADS_USER,
    listOptions
  )) {
    const start = +new Date();
    const items = await executeWithRetry(
      `fetchReviewItemsInPage(${JSON.stringify(listOptions)})`,
      () => fetchReviewItemsInPage(url), // Operation to retry
      maxRetries
    );
    allItems.push(...items);
    const elapsed = +new Date() - start;
    console.log(
      `- page:${urlParams.page} in ${elapsed}ms items:${
        items.length
      } ${JSON.stringify(urlParams)}`
    );
    console.debug(`  - url:${url}`);
    // termination conditions are in a inner function below
    if (shouldTerminate(items, urlParams, maxPages)) {
      break;
    }
  }

  return allItems;

  function shouldTerminate(
    data: ReviewItem[],
    urlParams: ListParams,
    maxPages: number
  ) {
    if (data.length === 0) {
      console.info(`- break: no items:${data.length}`);
      return true;
    }
    if (data.length < urlParams.per_page) {
      console.info(
        `- break: ${data.length} items < per_page:${urlParams.per_page} items, breaking`
      );
      return true;
    }
    if (urlParams.page >= maxPages) {
      console.warn(
        `- break page:${urlParams.page} of max:${maxPages} exceeded, breaking out of page loop.`
      );
      return true;
    }
    return false;
  }
}
// Add more HTML/static-specific methods here
export async function fetchReviewItemsInPage(
  url: string
): Promise<Array<ReviewItem>> {
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
        title,
        author,
        readCount,
        dateStartedValues,
        dateReadValues,
      } as ReviewItem;
      // console.log(`- Item: ${JSON.stringify(item)}`);
      return item;
    })
    .get() as ReviewItem[]; // convert back to a regular array
  // console.log(
  //   `- All Items (${items.length}): ${JSON.stringify(items, null, 2)}`
  // );

  return items;
}
