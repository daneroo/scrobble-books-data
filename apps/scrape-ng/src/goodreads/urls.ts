export type Shelf =
  | "#ALL#"
  | "currently-reading"
  | "on-deck"
  | "read"
  | "to-read";

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

export function listURL(userId: string, params: ListParams): string {
  const baseURL = `https://www.goodreads.com/review/list/${userId}`;
  const query = new URLSearchParams({
    ...params,
    page: params.page.toString(),
    per_page: params.per_page.toString(),
    utf8: "✓",
  }).toString();
  return `${baseURL}?${query}`;
}

export function itemURL(itemId: string): string {
  return `https://www.goodreads.com/review/show/${itemId}`;
}

export interface ListIteratorParams {
  shelf: Shelf;
  per_page: number;
}

export async function* shelfIterator(
  userId: string,
  listParams: ListIteratorParams
): AsyncIterableIterator<{ url: string; urlParams: ListParams }> {
  let page = 1;
  while (true) {
    const urlParams: ListParams = {
      shelf: listParams.shelf,
      page,
      per_page: listParams.per_page,
      sort: "date_added",
      order: "d",
    };
    const url = listURL(userId, urlParams);
    yield { url, urlParams };
    page++;
    // Assuming termination condition will be checked outside the iterator
  }
}
