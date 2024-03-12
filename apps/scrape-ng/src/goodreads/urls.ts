// inward facing params of iteration
import type { Shelf } from "./types";

/**
 * Generates the URL for a specific review on Goodreads.
 * This is where we get the reading progress and the shelf(ves).
 *
 * @param reviewId - The reviewId of the item.
 * @returns The URL of the item on Goodreads.
 */
export function itemURL(reviewId: string): string {
  return `https://www.goodreads.com/review/show/${reviewId}`;
}

export interface RSSParams {
  shelf: Shelf;
  page: number;
  key: string; // GOODREADS_KEY
}

/**
 * Generates the URL for a Goodreads list based on the provided user ID and list parameters.
 * @param userId - The ID of the user whose list is being generated.
 * @param rssParams - listing parameters, shelf, per_page, ...
 * @returns The URL for the Goodreads list.
 */
export function rssURL(userId: string, rssParams: RSSParams): string {
  const baseURL = `https://www.goodreads.com/review/list_rss/${userId}`;
  const query = new URLSearchParams({
    ...rssParams,
    page: rssParams.page.toString(), // override page to string
  }).toString();
  return `${baseURL}?${query}`;
}

/**
 * Generates an async iterator that yields pages of a Goodreads RSS feed for a given user and shelf.
 * - maxPages is a safeguard against runaway iteration. but you can set maxPages to -1 to iterate without termination.
 *   I suggest setting it a reasonable large value (50) to avoid infinite loops.
 * - maxItemsPerPage is the known maximum number of items per page,
 *   and is returned to the client so they might their iteration early (i.e. when items.length < itemsPerPage)
 *
 * @param userId - The Goodreads user ID whose feed to iterate.
 * @param GOODREADS_KEY - The API key for Goodreads.
 * @param shelf - The shelf to retrieve.
 * @param maxPages - The maximum number of pages to iterate, this is a safeguard against runaway iteration. but you can set maxPages to -1 without termination.
 * @returns An async iterator that yields objects containing the URL, params, and max items per page for each page.
 */
export async function* rssIterator(
  userId: string,
  GOODREADS_KEY: string,
  shelf: Shelf,
  maxPages: number
): AsyncIterableIterator<{
  url: string;
  urlParams: RSSParams;
  maxItemsPerPage: number;
}> {
  let page = 1;
  // this is what we know the feed pages return as itemsPerPage
  // we return it to the client so they might their iteration early (i.e. when items.length < itemsPerPage)
  const maxItemsPerPage = 100;
  while (maxPages < 0 || page <= maxPages) {
    const urlParams: RSSParams = {
      shelf,
      page,
      key: GOODREADS_KEY,
    };
    const url = rssURL(userId, urlParams);
    yield { url, urlParams, maxItemsPerPage };
    page++;
  }
  // this can only be reached if maxPages>=0
  // console.log(`rssIterator:done page:${page - 1} reached maxPages:${maxPages}`);
}
