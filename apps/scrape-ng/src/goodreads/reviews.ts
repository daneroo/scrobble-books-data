import type { Page } from "playwright";
import { shelfIterator } from "./urls";

import type { ReviewItem, Credentials } from "..";
import type { Shelf, ListIteratorParams, ListParams } from "./urls";

/**
 * Fetches all review items from Goodreads.
 *
 * Iterates over review pages for a given shelf/per_page
 * and accumulates items from each page.
 * Also performs retry logic for each page.
 *
 * @param page - The page object for web scraping.
 * @param credentials - The credentials object containing user credentials.
 * @param listParams - The parameters for iterating through the list of review items.
 * @returns A promise that resolves to an array of review items.
 */
export async function fetchAllReviewItems(
  page: Page,
  credentials: Credentials,
  listParams: ListIteratorParams
): Promise<Array<ReviewItem>> {
  const maxPages = 100;
  const maxRetries = 5;

  const allItems: ReviewItem[] = [];

  for await (const { url, urlParams } of shelfIterator(
    credentials.GOODREADS_USER,
    listParams
  )) {
    const start = +new Date();
    const items = await executeWithRetry(
      `fetchReviewItemsInPage(${JSON.stringify(listParams)})`,
      () => fetchReviewItemsInPage(page, url), // Operation to retry
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

/**
 * Fetches review items from a given Goodreads reviews page.
 * Meant to be called only from fetchAllReviewItems
 *
 * @param page - Playwright Page object for browser automation.
 * @param url - URL of the Goodreads reviews page to scrape.
 * @returns Promise resolving to an array of scraped review items.
 */
async function fetchReviewItemsInPage(
  page: Page,
  url: string
): Promise<Array<ReviewItem>> {
  // timing - wait for the page to load
  const maxTimeout = 10000; // the default 30s might be too long, this is just being more explicit, in case we want to change it
  await page.goto(url, { waitUntil: "load", timeout: maxTimeout });

  // - wait for the table to be present (even if hidden)
  // this is simply 'table#books tbody#booksBody'
  const booksBodyLocator = page.locator("#booksBody");
  await booksBodyLocator.waitFor({ state: "attached" }); // state:attached means even if not visible

  const data = await booksBodyLocator.locator("tr").evaluateAll((rows) => {
    return rows.map((row) => {
      const id = row.getAttribute("id");
      const title = row?.querySelector(".field.title a")?.textContent?.trim();
      const author = row?.querySelector(".field.author a")?.textContent?.trim();
      const readCount = row
        ?.querySelector(".field.read_count .value")
        ?.textContent?.trim();

      const dateStartedValues = Array.from(
        row.querySelectorAll(".field.date_started .date_started_value")
      ).map((el: any) => el?.textContent?.trim());

      const dateReadValues = Array.from(
        row.querySelectorAll(".field.date_read .date_read_value")
      ).map((el: any) => el?.textContent?.trim());

      return {
        id,
        title,
        author,
        readCount,
        dateStartedValues,
        dateReadValues,
      };
    });
  });
  return data;
}

/**
 * Executes an asynchronous operation with retries upon failure.
 *
 * @param operation - The asynchronous operation to execute.
 * @param maxRetries - Maximum number of retries before giving up.
 * @returns A promise with the result of the async operation.
 */
async function executeWithRetry<T>(
  name: string,
  operation: () => Promise<T>,
  maxRetries: number
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation(); // Attempt to execute the operation
    } catch (error) {
      console.error(
        `- ${name}: Attempt ${attempt + 1} of ${maxRetries} failed: ${error}`
      );
      if (attempt >= maxRetries - 1) throw error; // Rethrow the last error after all attempts fail
    }
  }
  throw new Error("executeWithRetry reached an unexpected state"); // Should never reach here
}
