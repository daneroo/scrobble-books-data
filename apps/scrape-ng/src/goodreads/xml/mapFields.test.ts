import { describe, expect, test } from "bun:test";

import type { RSSItem } from "../types";
import {
  type FeedItemType,
  mapFields,
  safeDate,
  safeIntAsString,
  safeRoundedAverageRating,
} from "./mapFields";

describe("mapFields", () => {
  test("should map fields correctly", () => {
    // the function should exist
    expect(mapFields).toBeDefined();
  });
  test("should correctly map fields (happy-path)", () => {
    const item: FeedItemType = {
      guid: "https://www.goodreads.com/review/show/4805380847?utm_medium=api&utm_source=rss",
      pubDate: "Sat, 16 Mar 2024 00:02:46 -0700", // ignored
      title: "Dzur (Vlad Taltos, #10)",
      link: "https://www.goodreads.com/review/show/4805380847?utm_medium=api&utm_source=rss",
      book_id: "133453",
      book_image_url:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1388849702l/133453._SY75_.jpg",
      book_small_image_url:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1388849702l/133453._SY75_.jpg",
      book_medium_image_url:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1388849702l/133453._SX98_.jpg",
      book_large_image_url:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1388849702l/133453.jpg",
      book_description:
        "<div><b>In which Vlad Taltos confronts the Left Hand of the Jhereg...and discovers the game has more players than he thought</b><br /><br />Vlad Taltos, short-statured, short-lived human in an Empire of tall, long-lived Dragaerans, has always had to keep his wits about him. Long ago, he made a place for himself as a captain of the Jhereg, the noble house that runs the rackets in the great imperial city of Adrilankha. But love, revolution, betrayal, and revenge ensued, and for years now Vlad has been a man on the run, struggling to stay a step ahead of the Jhereg who would kill him without hesitation.<br /><br />Now Vlad's back in Adrilankha. The rackets he used to run are now under the control of the mysterious \"Left Hand of the Jhereg\"--a secretive cabal of women who report to no man. His ex-wife needs his help. His old enemies aren't sure whether they want to kill him, or talk to him and then kill him. A goddess may be playing tricks with his memory. And the Great Weapon he's carrying seems to have plans of its own...<br /><br />Picking up directly where <i>Issola</i> left off, <i>Dzur</i> gives us Vlad Taltos at his best--swashbuckling storytelling with a wry and gritty edge.<br /></div>",
      book: {
        num_pages: "285",
      },
      author_name: "Steven Brust",
      isbn: "0765301482",
      user_name: "Daniel",
      user_rating: "4",
      user_read_at: "Sun, 3 Jul 2022 00:00:00 +0000",
      user_date_added: "Sat, 16 Mar 2024 00:02:46 -0700",
      user_date_created: "Fri, 24 Jun 2022 22:59:43 -0700",
      user_shelves: "currently-reading",
      user_review: "",
      average_rating: "4.15",
      book_published: "2006",
      description:
        '\n      <a href="https://www.goodreads.com/book/show/133453.Dzur?utm_medium=api&amp;utm_source=rss"><img alt="Dzur (Vlad Taltos, #10)" src="https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1388849702l/133453._SY75_.jpg" /></a><br/>\n                                      author: Steven Brust<br/>\n                                      name: Daniel<br/>\n                                      average rating: 4.15<br/>\n                                      book published: 2006<br/>\n                                      rating: 4<br/>\n                                      read at: 2022/07/03<br/>\n                                      date added: 2024/03/16<br/>\n                                      shelves: currently-reading<br/>\n                                      review: <br/><br/>\n                                      ',
    };

    const expectedOutput: RSSItem = {
      id: "https://www.goodreads.com/review/show/4805380847?utm_medium=api&utm_source=rss",
      title: "Dzur (Vlad Taltos, #10)",
      link: "https://www.goodreads.com/review/show/4805380847?utm_medium=api&utm_source=rss",
      bookId: "133453",
      bookImageURL:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1388849702l/133453._SY75_.jpg",
      bookDescription:
        "<div><b>In which Vlad Taltos confronts the Left Hand of the Jhereg...and discovers the game has more players than he thought</b><br /><br />Vlad Taltos, short-statured, short-lived human in an Empire of tall, long-lived Dragaerans, has always had to keep his wits about him. Long ago, he made a place for himself as a captain of the Jhereg, the noble house that runs the rackets in the great imperial city of Adrilankha. But love, revolution, betrayal, and revenge ensued, and for years now Vlad has been a man on the run, struggling to stay a step ahead of the Jhereg who would kill him without hesitation.<br /><br />Now Vlad's back in Adrilankha. The rackets he used to run are now under the control of the mysterious \"Left Hand of the Jhereg\"--a secretive cabal of women who report to no man. His ex-wife needs his help. His old enemies aren't sure whether they want to kill him, or talk to him and then kill him. A goddess may be playing tricks with his memory. And the Great Weapon he's carrying seems to have plans of its own...<br /><br />Picking up directly where <i>Issola</i> left off, <i>Dzur</i> gives us Vlad Taltos at his best--swashbuckling storytelling with a wry and gritty edge.<br /></div>",
      authorName: "Steven Brust",
      isbn: "0765301482",
      userName: "Daniel",
      userRating: "4",
      userReadAt: "2022-07-03T00:00:00.000Z",
      userDateAdded: "2024-03-16T07:02:46.000Z",
      userDateCreated: "2022-06-25T05:59:43.000Z",
      userShelves: "currently-reading",
      userReview: "",
      averageRating: "4.2",
      bookPublished: "2006",
      description:
        '<a href="https://www.goodreads.com/book/show/133453.Dzur?utm_medium=api&amp;utm_source=rss"><img alt="Dzur (Vlad Taltos, #10)" src="https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1388849702l/133453._SY75_.jpg" /></a><br/>\n                                      author: Steven Brust<br/>\n                                      name: Daniel<br/>\n                                      average rating: 4.2<br/>\n                                      book published: 2006<br/>\n                                      rating: 4<br/>\n                                      read at: 2022/07/03<br/>\n                                      date added: 2024/03/16<br/>\n                                      shelves: currently-reading<br/>\n                                      review: <br/><br/>',
      numPages: "285",
    };
    expect(mapFields(item)).toEqual(expectedOutput);
  });
});

describe("safeDate", () => {
  test("should return an ISO string for a valid date", () => {
    const input = "2022-01-01";
    const expectedOutput = "2022-01-01T00:00:00.000Z";
    expect(safeDate(input)).toBe(expectedOutput);
  });

  test("should return an empty string for an invalid date", () => {
    const input = "invalid-date";
    const expectedOutput = "";
    expect(safeDate(input)).toBe(expectedOutput);
  });
});

describe("safeIntAsString", () => {
  test("should return '0' for an empty string", () => {
    const input = "";
    const expectedOutput = "0";
    expect(safeIntAsString(input)).toBe(expectedOutput);
  });

  test("should return stringified number for a valid number string", () => {
    const input = "123";
    const expectedOutput = "123";
    expect(safeIntAsString(input)).toBe(expectedOutput);
  });

  test("should return '0' for an invalid number string", () => {
    const input = "invalid-number";
    const expectedOutput = "0";
    expect(safeIntAsString(input)).toBe(expectedOutput);
  });
});

describe("safeRoundAverageRating", () => {
  // Returns the rounded average rating and the description with the rounded rating when given valid input
  test("should return the rounded average rating and the description with the rounded rating when given valid input", () => {
    // Arrange
    const average_rating = "4.567";
    const description = "This book has an average rating: 4.567";

    // Act
    const result = safeRoundedAverageRating({ average_rating, description });

    // Assert
    expect(result.roundedAverageRating).toBe("4.6");
    expect(result.descriptionWithRoundedRating).toBe(
      "This book has an average rating: 4.6"
    );
  });
  test("round properly when Number(average_rating) is an integer (bug fix)", () => {
    // Arrange
    const input = {
      average_rating: "4.00",
      description:
        "name: Daniel<br/>\n                                      average rating: 4.00<br/>\n                                      book published: <br/>",
    };
    // const average_rating = "4.567";
    // const description = "This book has an average rating: 4.567";

    // Act
    const result = safeRoundedAverageRating(input);

    // Assert
    expect(result.roundedAverageRating).toBe("4.0");
    expect(result.descriptionWithRoundedRating).toBe(
      "name: Daniel<br/>\n                                      average rating: 4.0<br/>\n                                      book published: <br/>"
    );
  });
});
