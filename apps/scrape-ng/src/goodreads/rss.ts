import * as fs from "fs/promises";
import path from "path";

import { fetchWithRetryAndTimeout } from "./fetchHelpers";
import { decorateAllItemsWithReadingProgress } from "./fetchReadingProgress";
import { parseXML } from "./parseXML";
import { timeOne } from "./timeHelpers";
import type { Credentials, Feed, RSSItem, Shelf } from "./types";
import { rssIterator, type RSSParams } from "./urls";
import { feedPageSchema } from "./z-types";

export type FetchOptions = {
  shelf: Shelf;
  maxPages: number;
  maxItems: number;
  concurrency: number;
};
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
  fetchOptions: FetchOptions
): Promise<Feed> {
  const allItems: RSSItem[] = [];
  const { shelf, maxPages, maxItems, concurrency } = fetchOptions;

  for await (const { url, urlParams, maxItemsPerPage } of rssIterator(
    credentials.GOODREADS_USER, // might not always be the case, but fixed for now.
    credentials.GOODREADS_KEY,
    shelf,
    maxPages
  )) {
    // const items = await fetchFeedPage(url, urlParams);
    const items: RSSItem[] = await timeOne(
      () => fetchFeedPage(url, urlParams),
      (elapsed, result) =>
        console.log(
          `- page:${urlParams.page} shelf:${urlParams.shelf} in ${elapsed}ms items:${result.length}`
        )
    );

    allItems.push(...items);

    // termination conditions
    if (items.length === 0 || items.length < maxItemsPerPage) {
      // items.length === 0 there are definitely no more items, so we can terminate.
      // items.length < maxItemsPerPage this is the last page, so we can terminate early
      break;
    }
  }

  const maxedItems = maxItems < 0 ? allItems : allItems.slice(0, maxItems);
  await decorateAllItemsWithReadingProgress(maxedItems, concurrency);

  const feed = {
    // TODO(daneroo): get the feed title from the (first page) feedPage
    title: "Daniel's bookshelf: all",
    // lastBuildDate: stamp, // was for provenance, but we prefer not to cause file difference
    items: maxedItems, // Where we will accumulate the pages items
  };

  return feed;
}

async function fetchFeedPage(
  url: string,
  urlParams: RSSParams
): Promise<RSSItem[]> {
  // TODO(daneroo): optimize feedPage timeout
  const timeout = 5000;
  const maxRetries = 5;

  console.log(`- Fetching page:${urlParams.page} of ${urlParams.shelf}`);

  const response = await fetchWithRetryAndTimeout(
    url,
    {},
    {
      name: `fetchFeedPage(${urlParams.shelf},${urlParams.page})`,
      timeout: timeout,
      maxRetries: maxRetries,
    }
  );

  const xmlDataDir = "data/xml";
  await fs.mkdir(xmlDataDir, { recursive: true });
  const jsonDataDir = "data/rss-json";
  await fs.mkdir(jsonDataDir, { recursive: true });

  const xml = await response.text();
  const xmlFile = `${xmlDataDir}/goodreads-rss-ng-${urlParams.page}.xml`;
  await fs.writeFile(xmlFile, xml);
  console.log(`  - Wrote ${xmlFile}`);

  const xmlObject = await parseXML(xml);
  const jsonFile = `${jsonDataDir}/goodreads-rss-ng-${urlParams.page}.json`;
  await fs.writeFile(jsonFile, JSON.stringify(xmlObject, null, 2));
  console.log(`  - Wrote ${jsonFile}`);
  // validate parsed feedPage
  const zResult = feedPageSchema.safeParse(xmlObject);

  if (!zResult.success) {
    console.log("RSS Validation failed", zResult.error);
    throw zResult.error;
  }
  console.log(`- Validated rss-parser-raw-${urlParams.page}.json`);

  const feedPage = zResult.data;
  // items is not present if there are no items, hence  ?? []
  const feedItems = feedPage.rss.channel.item ?? [];

  // get zod to validate feedPage
  // @ts-ignore
  const items: RSSItem[] = feedItems.map((item) => {
    // guid looks like: https://www.goodreads.com/review/show/6309249800?utm_medium=api&utm_source=rss
    const reviewId = reviewIdFromGuid(item.guid);

    const rssItem: RSSItem = {
      reviewId,
      id: item.guid,
      title: item.title,
      link: item.link,
      bookId: item.book_id,
      bookImageURL: item.book_image_url,
      bookDescription: item.book_description,
      authorName: item.author_name,
      isbn: item.isbn,
      userName: item.user_name,
      userRating: item.user_rating,
      userReadAt: item.user_read_at,
      userDateAdded: item.user_date_added,
      userDateCreated: item.user_date_created,
      userShelves: item.user_shelves,
      userReview: item.user_review,
      averageRating: item.average_rating,
      bookPublished: item.book_published,
      description: item.description,
      numPages: item.book.num_pages,
    };
    return rssItem;
  });
  return items;
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
