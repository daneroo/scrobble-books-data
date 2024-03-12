import Parser from "rss-parser";

import { fetchWithTimeout } from "./fetchWithTimeout";
import { executeWithRetry } from "./retry";
import type { Credentials, Feed, ListOptions, RSSItem } from "./types";
import { rssIterator, type RSSParams } from "./urls";

/**
 * Fetches all rss items with retry.
 *
 * Iterates over rss feed pages for a given shelf/per_page
 * and accumulates items from each page.
 * Also performs retry logic for each page.
 *
 * @param fetchOptions - The fetch options.
 * @returns A promise that resolves to an array of review items.
 */
export async function fetchFeed(
  credentials: Credentials,
  listOptions: ListOptions
): Promise<Feed> {
  const maxPages = 3;
  const maxRetries = 5;

  const allItems: RSSItem[] = [];

  for await (const { url, urlParams } of rssIterator(
    credentials.GOODREADS_USER,
    listOptions
  )) {
    const start = +new Date();
    const items = await executeWithRetry(
      `fetchFeed(${JSON.stringify(listOptions)})`,
      () => fetchFeedPage(url, urlParams), // Operation to retry
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

  const feed = {
    title: "Daniel's bookshelf: all",
    // lastBuildDate: stamp, // was for provenance, but we prefer not to cause file difference
    items: [], // Where we will accumulate the pages items
  };

  return feed;
}

async function fetchFeedPage(
  url: string,
  urlParams: RSSParams
): Promise<RSSItem[]> {
  // TODO(daneroo): optimize feedPage timeout
  const timeout = 5000;

  console.log(`- Fetching page:${urlParams.page} of ${url}`);
  const response = await fetchWithTimeout(url, {}, timeout);

  if (!response.ok) {
    console.debug(`- response:${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch page: ${url}`);
  }
  const xml = await response.text();
  const parser = new Parser({
    customFields: {
      feed: [
        // all other fields are already present in the feed object
        // "xhtml:meta"  // name robots - not needed
        // "atom:link", // same as link - not needed
      ],
      item: [
        // all other fields are already present in the item object
        "book_id",
        "book_image_url",
        "book_small_image_url",
        "book_medium_image_url",
        "book_large_image_url",
        "book_description",
        "book",
        "author_name",
        "isbn",
        "user_name",
        "user_rating",
        "user_read_at",
        "user_date_added",
        "user_date_created",
        "user_shelves",
        "user_review",
        "average_rating",
        "book_published",
        "description",
      ],
    },
  });
  // let feed = await parser.parseURL('https://www.reddit.com/.rss');
  const feedPage = await parser.parseString(xml);
  // console.log(feedPage?.title);
  const items = feedPage?.items || [];
  // console.log(JSON.stringify(feedPage, null, 2));
  console.log(JSON.stringify(items[0], null, 2));

  return [];
}

// TODO(daneroo): robust/selective fill in of reading progress here instead!
// console.log(`- Fetching reading progress for ${allItems.length} items`);
// for (const item of allItems) {
//   const { reviewId } = item;
//   if (!reviewId) {
//     console.warn(
//       `  - Skipping item with no reviewId: ${JSON.stringify(item)}`
//     );
//     continue;
//   } else {
//     const start = +new Date();
//     const readingProgress = await executeWithRetry(
//       `${fetchOptions.engine}:fetchReadingProgress(${reviewId})`,
//       () => scrapingContext.fetchReadingProgress(reviewId), // Operation to retry
//       maxRetries
//     );
//     const elapsed = +new Date() - start;
//     console.log(
//       `  - Progress in ${elapsed}ms for ${item.reviewId} - ${item.author} - ${item.title}`
//     );
//     // override shelves in item
//     // TODO(daneroo): runtime validation that they are equivalent?
//     item.shelves = readingProgress.shelves;
//     // console.log(`    - shelves:${item.shelves}`);
//     // now timeline
//     // readingProgress.timeline.forEach((event) => {
//     //   console.log(`    - ${event.date}: ${event.event}`);
//     // });
//   }
// }

/**
 * Termination condition for fetchFeed.
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
  items: RSSItem[],
  urlParams: RSSParams,
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
