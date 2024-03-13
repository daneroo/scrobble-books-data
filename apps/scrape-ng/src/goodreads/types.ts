// needed for the goodreads API, may not all be necessary depending on required actions
export interface Credentials {
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

export type Feed = {
  title: string;
  items: RSSItem[];
};

export type RSSItem = {
  id: string;
  reviewId: string;
  title: string;
  author: string;
  readCount: string;
  shelves: string[];
  dateStartedValues: string[];
  dateReadValues: string[];
};

export interface ReadingProgress {
  reviewId: string;
  shelves: string[];
  timeline: { date: string; event: string }[];
  readCount: number;
}
