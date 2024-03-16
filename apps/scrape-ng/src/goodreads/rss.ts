import * as fs from "fs/promises";

import { fetchWithRetryAndTimeout } from "./fetchHelpers";
import { timeOne } from "./timeHelpers";
import type { Credentials, Feed, RSSItem, Shelf } from "./types";
import { rssIterator, type RSSParams } from "./urls";
import { mapFields } from "./xml/mapFields";
import { parseXML } from "./xml/parseXML";
import { validateXML } from "./xml/validateXML";

export type FetchOptions = {
  shelf: Shelf;
  maxPages: number;
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
  const { shelf, maxPages } = fetchOptions;

  let title = "";
  for await (const { url, urlParams, maxItemsPerPage } of rssIterator(
    credentials.GOODREADS_USER, // might not always be the case, but fixed for now.
    credentials.GOODREADS_KEY,
    shelf,
    maxPages
  )) {
    const feedPage: Feed = await timeOne(
      () => fetchFeedPage(url, urlParams),
      (elapsed, result) =>
        console.log(
          `- page:${urlParams.page} shelf:${urlParams.shelf} in ${elapsed}ms items:${result.items.length}`
        )
    );
    if (title === "") {
      // console.log(`- Setting title:${feedPage.title}`);
      title = feedPage.title;
    } else if (title !== feedPage.title) {
      console.warn(
        `Title changed from ${title} to ${feedPage.title} on page:${urlParams.page}`
      );
    }

    allItems.push(...feedPage.items);

    // termination conditions
    if (
      feedPage.items.length === 0 ||
      feedPage.items.length < maxItemsPerPage
    ) {
      // items.length === 0 there are definitely no more items, so we can terminate.
      // items.length < maxItemsPerPage this is the last page, so we can terminate early
      break;
    }
  }

  const feed = {
    // TODO(daneroo): get the feed title from the (first page) feedPage
    title,
    items: allItems, // Where we will accumulate the pages items
  };

  return feed;
}

async function fetchFeedPage(url: string, urlParams: RSSParams): Promise<Feed> {
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
  const xml = await response.text();
  const verbosity = 0;
  if (verbosity > 0) {
    const xmlDataDir = "data/xml";
    await fs.mkdir(xmlDataDir, { recursive: true });
    const xmlFile = `${xmlDataDir}/goodreads-rss-ng-${urlParams.page}.xml`;
    await fs.writeFile(xmlFile, xml);
    console.log(`  - Wrote ${xmlFile}`);
  }

  const xmlObject = await parseXML(xml);
  // throws if invalid
  const feedPage = validateXML(xmlObject);
  console.log(`- Validated rss-parser-raw-${urlParams.page}.json`);

  if (verbosity > 0) {
    const jsonDataDir = "data/rss-json";
    await fs.mkdir(jsonDataDir, { recursive: true });
    const jsonFile = `${jsonDataDir}/goodreads-rss-ng-${urlParams.page}.json`;
    await fs.writeFile(jsonFile, JSON.stringify(feedPage, null, 2));
    console.log(`  - Wrote ${jsonFile}`);
  }

  // items is not present if there are no items, hence  ?? []
  const feedItems = feedPage.rss.channel.item ?? [];

  const items: RSSItem[] = feedItems.map(mapFields);
  return {
    title: feedPage.rss.channel.title,
    items,
  };
}
