import { z } from "zod";

import { type RSSItem } from "../types";
import { type itemSchema } from "./validateXML";

type FeedItemType = z.infer<typeof itemSchema>;

export function mapFields(item: FeedItemType): RSSItem {
  // guid looks like: https://www.goodreads.com/review/show/6309249800?utm_medium=api&utm_source=rss

  // Round the average rating to 0.1 (toFixed(1)) to reduce commit noise
  const { roundedAverageRating, descriptionWithRoundedRating } =
    safeRoundedAverageRating({
      average_rating: item.average_rating,
      description: item.description,
    });

  const rssItem: RSSItem = {
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
    userReadAt: safeDate(item.user_read_at),
    userDateAdded: safeDate(item.user_date_added),
    userDateCreated: safeDate(item.user_date_created),
    userShelves: item.user_shelves,
    userReview: item.user_review,
    averageRating: roundedAverageRating,
    bookPublished: item.book_published,
    description: descriptionWithRoundedRating,
    numPages: safeIntAsString(item.book.num_pages),
  };
  return rssItem;
}

function safeDate(d: string): string {
  try {
    return new Date(d).toISOString();
  } catch (e) {
    // swallow RangeError, else re-throw
    if (!(e instanceof RangeError)) {
      throw e;
    }
  }
  return "";
}

function safeIntAsString(s: string): string {
  if (s === "") {
    return "0";
  }
  const n = parseInt(s, 10);
  if (isNaN(n)) {
    console.warn(`  - safeIntAsString: ${s} is not a number`);
    return "0";
  }
  return n.toString();
}

function safeRoundedAverageRating({
  average_rating,
  description,
}: {
  average_rating: string;
  description: string;
}): {
  roundedAverageRating: string;
  descriptionWithRoundedRating: string;
} {
  // Round the average rating to 0.1 (toFixed(1)) to reduce commit noise
  // Also, replace the same average rating in the description field
  const averageRating = Number(average_rating);
  if (!isNaN(averageRating)) {
    const roundedAverageRating = averageRating.toFixed(1);
    const descriptionWithRoundedRating = description.replace(
      `average rating: ${averageRating}`,
      `average rating: ${roundedAverageRating}`
    );
    return {
      roundedAverageRating,
      descriptionWithRoundedRating,
    };
  }
  return {
    roundedAverageRating: average_rating,
    descriptionWithRoundedRating: description,
  };
}
