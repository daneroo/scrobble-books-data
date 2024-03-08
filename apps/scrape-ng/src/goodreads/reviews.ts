// Re-export everything under browser and html namespaces
import * as browser from "./browser/module";
import * as html from "./html/module";
import { executeWithRetry } from "./retry";
// no longer need to export { browser, html };
import type { FetchOptions, ReviewItem, ScrapingContext } from "./types";
import { type ListParams, shelfIterator } from "./urls";

/**
 * Fetches all review items from Goodreads.
 * - creates a scraping context based on the provided fetch options (engine)
 * - calls fetchAllReviewItemsWithRetry (using scraping context)
 * - performs cleanup of the scraping context
 *
 * @param fetchOptions - The options for fetching the review items.
 * @returns A promise that resolves to an array of review items.
 */
export async function fetchAllReviewItems(
  fetchOptions: FetchOptions
): Promise<Array<ReviewItem>> {
  const scrapingContext: ScrapingContext = await createContext(fetchOptions);
  console.log(`- Created scraping context for ${fetchOptions.engine}`);
  const start = +new Date();
  const items = await fetchAllReviewItemsWithRetry(
    fetchOptions,
    scrapingContext
  );
  const elapsed = +new Date() - start;
  console.log(
    `- Fetched ${items.length} items in ${elapsed}ms using ${fetchOptions.engine}`
  );
  await scrapingContext.cleanup();
  console.log(`- Cleanup scraping context for ${fetchOptions.engine} engine`);
  return items;
}

/**
 * Fetches all review items with retry.
 *
 * Iterates over review pages for a given shelf/per_page
 * and accumulates items from each page.
 * Also performs retry logic for each page.
 *
 * @param fetchOptions - The fetch options.
 * @param scrapingContext - The scraping context.
 * @returns A promise that resolves to an array of review items.
 */
async function fetchAllReviewItemsWithRetry(
  fetchOptions: FetchOptions,
  scrapingContext: ScrapingContext
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
      `${fetchOptions.engine}:fetchReviewItemsInPage(${JSON.stringify(
        listOptions
      )})`,
      () => scrapingContext.fetchReviewItemsInPage(url), // Operation to retry
      maxRetries
    );
    allItems.push(...items);
    const elapsed = +new Date() - start;
    console.log(
      `- page:${urlParams.page} in ${elapsed}ms items:${
        items.length
      } ${JSON.stringify(urlParams)}`
    );
    // console.debug(`  - url:${url}`);
    // termination conditions are in a inner function below
    if (shouldTerminate(items, urlParams, maxPages)) {
      break;
    }
  }
  // TODO(daneroo): robust/selective fill in of reading progress here instead!
  // TODO(daneroo): need a runtime validation of items: ReviewItem[]
  return allItems;
}

/**
 * Termination condition for fetchAllReviewItemsWithRetry.
 * Called after every page fetch, termination conditions are:
 * - no items: items.length === 0
 * - less than per_page items: items.length < urlParams.per_page
 * - max pages exceeded: urlParams.page >= maxPages
 *
 * @param items - The array of review items.
 * @param urlParams - The parameters for the URL.
 * @param maxPages - The maximum number of pages.
 * @returns A boolean indicating whether the scraping process should terminate.
 */
function shouldTerminate(
  items: ReviewItem[],
  urlParams: ListParams,
  maxPages: number
) {
  if (items.length === 0) {
    console.info(`- break: no items:${items.length}`);
    return true;
  }
  if (items.length < urlParams.per_page) {
    console.info(
      `- break: ${items.length} items < per_page:${urlParams.per_page} items, breaking`
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

/**
 * Creates a scraping context based on the provided fetch options (engine).
 *
 * @param fetchOptions - The options for fetching data.
 * @returns A promise that resolves to a `ScrapingContext` object.
 * @throws {Error} If the engine specified in `fetchOptions` is not supported.
 */
async function createContext(
  fetchOptions: FetchOptions
): Promise<ScrapingContext> {
  if (fetchOptions.engine === "browser") {
    // Use Puppeteer
    return browser.createContext(fetchOptions);
  } else if (fetchOptions.engine === "html") {
    // Use Cheerio
    return html.createContext(fetchOptions);
  } else {
    throw new Error(`Unsupported engine: ${fetchOptions.engine}`);
  }
}
