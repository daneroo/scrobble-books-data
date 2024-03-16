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
  // reviewId: string;
  id: string;
  title: string;
  link: string;
  bookId: string;
  bookImageURL: string;
  bookDescription: string;
  authorName: string;
  isbn: string;
  userName: string;
  userRating: string;
  userReadAt: string;
  userDateAdded: string;
  userDateCreated: string;
  userShelves: string;
  userReview: string;
  averageRating: string;
  bookPublished: string;
  description: string;
  numPages: string;
  // readCount: string;
  // shelves: string[];
  // dateStartedValues: string[];
  // dateReadValues: string[];
};

export interface ReadingProgress {
  reviewId: string;
  shelves: string[];
  timeline: { date: string; event: string }[];
  readCount: number;
}
