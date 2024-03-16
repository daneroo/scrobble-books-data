import path from "path";
import { z } from "zod";

import { type RSSItem } from "../types";
import { type itemSchema } from "./validateXML";

type FeedItemType = z.infer<typeof itemSchema>;

export function mapFields(item: FeedItemType): RSSItem {
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
