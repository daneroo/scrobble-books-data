// inward facing params of iteration
import type { ListOptions, Shelf } from "./types";

export interface ListParams {
  shelf: Shelf;
  page: number;
  per_page: number;
  // sort : noted
  //   date_read is the default when logged in
  //   date_added is the default when not logged in, and cannot be changed
  //   so we set it to date_added, and order=d so that we get the same behavior
  //   wether we are logged in or not.
  sort: "date_added"; // | "date_read" | "date_updated"; // Fixed for now
  order: "d"; // | "a"; // Fixed for now
}

/**
 * Generates the URL for a Goodreads list based on the provided user ID and list parameters.
 * @param userId - The ID of the user whose list is being generated.
 * @param listParams - listing parameters, shelf, per_page, ...
 * @returns The URL for the Goodreads list.
 */
export function listURL(userId: string, listParams: ListParams): string {
  const baseURL = `https://www.goodreads.com/review/list/${userId}`;
  const query = new URLSearchParams({
    ...listParams,
    page: listParams.page.toString(),
    per_page: listParams.per_page.toString(),
    utf8: "✓",
  }).toString();
  return `${baseURL}?${query}`;
}

export function itemURL(itemId: string): string {
  return `https://www.goodreads.com/review/show/${itemId}`;
}

/**
 * Asynchronous generator function that yields URLs and URL parameters for each page of a Goodreads shelf.
 *   We return the URL parameters as well, so that the caller can use them to terminate for example.
 *
 * @param userId - The ID of the user whose shelf is being iterated.
 * @param listOptions - The options for the shelf iteration.
 * @returns An async iterable iterator that yields objects containing the URL and URL parameters for each page.
 */
export async function* shelfIterator(
  userId: string,
  listOptions: ListOptions
): AsyncIterableIterator<{ url: string; urlParams: ListParams }> {
  let page = 1;
  while (true) {
    const urlParams: ListParams = {
      shelf: listOptions.shelf,
      per_page: listOptions.per_page,
      sort: "date_added",
      order: "d",
      page,
    };
    const url = listURL(userId, urlParams);
    yield { url, urlParams };
    page++;
    // Assuming termination condition will be checked outside the iterator
  }
}
