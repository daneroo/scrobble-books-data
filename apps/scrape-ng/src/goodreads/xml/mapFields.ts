import { z } from "zod";

import { type RSSItem } from "../types";
import { type itemSchema } from "./validateXML";

export type FeedItemType = z.infer<typeof itemSchema>;

export function mapFields(item: FeedItemType): RSSItem {
  // guid looks like: https://www.goodreads.com/review/show/6309249800?utm_medium=api&utm_source=rss

  // we ignore item.pubDate, it is to always be equal to user_date_added
  // if (item.pubDate !== item.user_date_added) {
  //   console.warn(
  //     `  - pubDate:${item.pubDate} !== user_date_added:${item.user_date_added}`
  //   );
  // }

  // Round the average rating to 0.1 (toFixed(1)) to reduce commit noise
  const { roundedAverageRating, descriptionWithRoundedRating } =
    safeRoundedAverageRating({
      average_rating: item.average_rating,
      description: item.description,
    });

  // regarding whitespace, the parser's trimValues: true, should have removed leading/trailing whitespace
  // but that does NOT affect CDATA sections <field><![CDATA[  value  ]]></field>
  // SO we will explicitly trim the `description`, `book_description` and `user_review` fields
  const rssItem: RSSItem = {
    id: item.guid,
    title: item.title,
    link: item.link,
    bookId: item.book_id,
    bookImageURL: item.book_image_url,
    bookDescription: item.book_description.trim(),
    authorName: item.author_name,
    isbn: item.isbn,
    userName: item.user_name,
    userRating: item.user_rating,
    userReadAt: safeDate(item.user_read_at),
    userDateAdded: safeDate(item.user_date_added),
    userDateCreated: safeDate(item.user_date_created),
    userShelves: item.user_shelves,
    userReview: item.user_review.trim(),
    averageRating: roundedAverageRating,
    bookPublished: item.book_published,
    description: descriptionWithRoundedRating.trim(),
    numPages: safeIntAsString(item.book.num_pages),
  };
  return rssItem;
}

/**
 * Converts a string representation of a date to an ISO string format.
 * If the input string is not a valid date, an empty string is returned.
 *
 * TODO(daneroo): we should decide if dates (no time part) should be simply YYYY-MM-DD
 *   because mapping 2024-01-01 to 2024-01-01T00:00:00.000Z may not be what we want
 * @param d - The string representation of the date.
 * @returns The ISO string representation of the date, or an empty string if the input is not a valid date.
 */
export function safeDate(d: string): string {
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

/**
 * Converts a string to an integer and returns it as a string.
 * If the input string is empty or cannot be parsed as an integer, it returns "0".
 * This is is just for numPages
 *
 * @param s - The string to convert to an integer.
 * @returns The input string converted to an integer as a string, or "0" if the conversion fails.
 */
export function safeIntAsString(s: string): string {
  if (s === "") {
    return "0";
  }
  const n = parseInt(s, 10);
  if (isNaN(n)) {
    // console.warn(`  - safeIntAsString: ${s} is not a number`);
    return "0";
  }
  return n.toString();
}

/**
 * Calculates the rounded average rating and updates the description field with the rounded rating.
 * If the average rating is not a valid number, it returns the original values.
 *
 * This is just to reduce "commit noise" when the average rating changes.
 * The average Rating appears in two fields, average_rating and description.
 *
 * @param {Object} params - The input parameters.
 * @param {string} params.average_rating - The average rating.
 * @param {string} params.description - The description.
 * @returns {Object} - The rounded average rating and the description with the rounded rating.
 */
export function safeRoundedAverageRating({
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
      `average rating: ${average_rating}`,
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
