import path from "path";
import Parser from "rss-parser";

import { fetchWithRetryAndTimeout } from "./fetchHelpers";
import { fetchReadingProgress } from "./fetchReadingProgress";
import type { Credentials, Feed, RSSItem, Shelf } from "./types";
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
  shelf: Shelf
): Promise<Feed> {
  const maxPages = 99;

  const allItems: RSSItem[] = [];

  for await (const { url, urlParams, maxItemsPerPage } of rssIterator(
    credentials.GOODREADS_USER,
    credentials.GOODREADS_KEY,
    shelf,
    maxPages
  )) {
    const start = +new Date();
    const items = await fetchFeedPage(url, urlParams);
    allItems.push(...items);
    const elapsed = +new Date() - start;
    console.log(
      `- page:${urlParams.page} in ${elapsed}ms items:${
        items.length
      } ${JSON.stringify(urlParams)}`
    );

    // termination conditions
    if (items.length === 0 || items.length < maxItemsPerPage) {
      // items.length === 0 there are definitely no more items, so we can terminate.
      // items.length < maxItemsPerPage this is the last page, so we can terminate early
      break;
    }
  }

  const feed = {
    title: "Daniel's bookshelf: all",
    // lastBuildDate: stamp, // was for provenance, but we prefer not to cause file difference
    items: allItems, // Where we will accumulate the pages items
  };

  // TODO(daneroo): robust/selective fill in of reading progress here instead!
  console.log(`- Fetching reading progress for ${allItems.length} items`);
  for (const item of allItems) {
    const { reviewId } = item;
    if (!reviewId) {
      console.warn(
        `  - Skipping item with no reviewId: ${JSON.stringify(item)}`
      );
      continue;
    }
    const start = +new Date();
    const readingProgress = await fetchReadingProgress(reviewId);
    const elapsed = +new Date() - start;
    console.log(
      `  - Progress in ${elapsed}ms for ${item.reviewId} - ${item.author} - ${item.title}`
    );
    // override shelves in item
    // TODO(daneroo): runtime validation that they are equivalent?
    item.shelves = readingProgress.shelves;
    // console.log(`    - shelves:${item.shelves}`);
    // now timeline
    // readingProgress.timeline.forEach((event) => {
    //   console.log(`    - ${event.date}: ${event.event}`);
    // });
  }

  return feed;
}

async function fetchFeedPage(
  url: string,
  urlParams: RSSParams
): Promise<RSSItem[]> {
  // TODO(daneroo): optimize feedPage timeout
  const timeout = 5000;
  const maxRetries = 5;

  console.log(`- Fetching page:${urlParams.page} of ${url}`);

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
  const parser = new Parser({
    customFields: {
      feed: [
        // all other fields are already present in the feed object
        // "xhtml:meta"  // name robots - not needed
        // "atom:link", // same as link - not needed
      ],
      item: [
        // all other fields are already present in the item object
        "guid",
        ["guid", "id"],
        ["guid", "reviewId"],
        // "book_id",
        // "book_image_url",
        // "book_small_image_url",
        // "book_medium_image_url",
        // "book_large_image_url",
        // "book_description",
        // "book", //  "$": {"id": "25895524"}, "num_pages": ["467"] }
        ["author_name", "author"],
        // "isbn",
        // "user_name",
        // "user_rating",
        "user_read_at",
        "user_date_added",
        "user_date_created",
        "user_shelves",
        // "user_review",
        // "average_rating",
        // "book_published",
        // "description",
      ],
    },
  });
  // let feed = await parser.parseURL('https://www.reddit.com/.rss');
  const feedPage = await parser.parseString(xml);
  // console.log(feedPage?.title);
  const feedItems = feedPage?.items || [];
  // console.log(JSON.stringify(feedPage, null, 2));
  // console.log(JSON.stringify(feedItems[0], null, 2));

  const items: RSSItem[] = feedItems.map((item) => {
    // guid looks like: https://www.goodreads.com/review/show/6309249800?utm_medium=api&utm_source=rss
    const guid = item.guid ?? "";
    const reviewId = reviewIdFromGuid(guid);

    return {
      id: reviewId, // item.guid,
      reviewId,
      title: item.title ?? "BAD",
      author: item.author ?? "BAD",
      readCount: "0",
      shelves: [item.user_shelves ?? ""], // comma separated?
      dateStartedValues: [item.user_read_at ?? "BAD"],
      dateReadValues: [item.user_read_at ?? "BAD"],
    };
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