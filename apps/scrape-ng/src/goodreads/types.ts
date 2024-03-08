// needed for the goodreads API, may not all be necessary depending on required actions
export interface Credentials {
  GOODREADS_USERNAME: string;
  GOODREADS_PASSWORD: string;
  GOODREADS_USER: string;
  GOODREADS_KEY: string;
}

// goodreads shelves
export type Shelf =
  | "#ALL#"
  | "currently-reading"
  | "on-deck"
  | "read"
  | "to-read";

// required options for shelfIterator
export interface ListOptions {
  shelf: Shelf;
  per_page: number;
}

export type Engine = "browser" | "html";

// merged options for fetchAllReviewItems - includes ListOptions and Credentials
export interface FetchOptions {
  engine: Engine;
  headless: boolean;
  authenticated: boolean;
  credentials: Credentials;
  listOptions: ListOptions;
}

// The common output type of fetchAllReviewItems (browser and html)
export interface ReviewItem {
  id: string;
  reviewId: string;
  title: string;
  author: string;
  readCount: string;
  dateStartedValues: string[];
  dateReadValues: string[];
}

export interface ScrapingContext {
  cleanup: () => Promise<void>;
  fetchReviewItemsInPage: (url: string) => Promise<Array<ReviewItem>>;
}
