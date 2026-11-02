/** The compatibility mapping, against rows of the reference copy. */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import type { Item } from "../goodreads.ts";
import {
  FEED_TITLE,
  readAt,
  toCompat,
  withRel,
  toCompatItem,
  year,
  type CompatItem,
} from "./mapping.ts";

const REFERENCE = join(
  import.meta.dir,
  "../../../../goodreads-rss-ng-2026-10-27T15.37Z.json",
);
const reference = (await Bun.file(REFERENCE).json()) as {
  title: string;
  items: CompatItem[];
};
const byBook = (bookId: string) =>
  reference.items.find((item) => item.bookId === bookId)!;

/** _Dominion_, as goodreads.json has it: read, rated 5, with a review. */
const dominion: Item = {
  reviewId: "3907963267",
  title: "Dominion: How the Christian Revolution Remade the World",
  bookId: "43885149",
  bookURL: "https://www.goodreads.com/book/show/43885149-dominion",
  bookImageURL:
    "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1550694436l/43885149._SY75_.jpg",
  isbn: "0465093507",
  userRating: 5,
  userReadAtText: "Apr 04, 2021",
  userDateCreatedDay: "2021-03-25",
  userExclusiveShelf: "read",
  averageRating: "4.3",
  bookPublishedText: "Sep 05, 2019",
  numPages: "624",
  userDateAddedDay: "2021-04-04",
  userReview:
    "This thoughtful and sweeping retelling of the West's cultural heritage leaves me with more questions than answers, as I suspect is it's insight.<br />Well worth the read.",
  bookDescription: byBook("43885149").bookDescription,
  authorName: "Tom Holland",
  timeline: [],
};

describe("toCompatItem", () => {
  test("Dominion equals the reference, but for the time of day", () => {
    const expected = byBook("43885149");
    const got = toCompatItem(dominion, "Daniel Lauzon");
    expect(got).toEqual({
      ...expected,
      // no page has the time of day: an approved difference (#28)
      userDateAdded: "2021-04-04T00:00:00.000Z",
      userDateCreated: "2021-03-25T00:00:00.000Z",
    });
    // the reference's key order, which the published file keeps
    expect(Object.keys(got)).toEqual(Object.keys(expected));
  });

  test("a fractional rating is floored: Time Travel 4.5 → '4', Debt 4.25 → '4'", () => {
    expect(byBook("28587584").userRating).toBe("4");
    for (const userRating of [4.5, 4.25])
      expect(
        toCompatItem({ ...dominion, userRating }, "Daniel").userRating,
      ).toBe("4");
    expect(
      toCompatItem({ ...dominion, userRating: 0 }, "Daniel").userRating,
    ).toBe("0");
  });

  test("userShelves is '' for read, the shelf name otherwise", () => {
    const shelves = (userExclusiveShelf: Item["userExclusiveShelf"]) =>
      toCompatItem({ ...dominion, userExclusiveShelf }, "Daniel").userShelves;
    expect(shelves("read")).toBe("");
    expect(shelves("on-deck")).toBe("on-deck");
    expect(shelves("currently-reading")).toBe("currently-reading");
  });

  test("userName is the first word of the full name", () => {
    expect(toCompatItem(dominion, "Daniel Lauzon").userName).toBe("Daniel");
  });

  test("the title is escaped in the description's alt, as the RSS did", () => {
    const got = toCompatItem(
      { ...dominion, title: `Tom & Jerry's "Best" <1>` },
      "Daniel",
    );
    expect(got.title).toBe(`Tom & Jerry's "Best" <1>`);
    expect(got.description).toContain(
      'alt="Tom &amp; Jerry&#39;s &quot;Best&quot; &lt;1&gt;"',
    );
  });
});

describe("bookDescription links", () => {
  test('a link with no rel gets rel="nofollow noopener", as the RSS had (House of Chains)', () => {
    expect(
      withRel(
        '<i>See <a href="https://www.goodreads.com/book/show/29081573-house-of-chains">here</a>.</i>',
      ),
    ).toBe(
      '<i>See <a href="https://www.goodreads.com/book/show/29081573-house-of-chains" rel="nofollow noopener">here</a>.</i>',
    );
  });

  test("a link that has a rel is left as it is; text without links too", () => {
    const kept =
      '<a target="_blank" rel="noopener" href="https://example.com">x</a> and <abbr>y</abbr>';
    expect(withRel(kept)).toBe(kept);
    expect(withRel("<b>No links</b><br />")).toBe("<b>No links</b><br />");
  });

  test("goodreads.json keeps the book page's links; only the compatibility file adds rel", () => {
    const html = '<a href="https://example.com">x</a>';
    expect(
      toCompatItem({ ...dominion, bookDescription: html }, "Daniel")
        .bookDescription,
    ).toBe('<a href="https://example.com" rel="nofollow noopener">x</a>');
  });
});

describe("dates and years", () => {
  test.each([
    ["Oct 24, 2026", "2026-10-24T00:00:00.000Z"],
    ["Oct 2026", "2026-10-01T00:00:00.000Z"],
    ["2026", "2026-01-01T00:00:00.000Z"],
    ["", ""],
  ])("read date %p → %p", (text, iso) => {
    expect(readAt(text)).toBe(iso);
  });

  test("a read date in another format throws", () => {
    expect(() => readAt("24/10/2026")).toThrow("read date not understood");
  });

  test.each([
    ["Sep 27, 2016", "2016"],
    ["2016", "2016"],
    ["-550", "-550"],
    ["unknown", ""],
  ])("publication %p → %p", (text, published) => {
    expect(year(text)).toBe(published);
  });
});

test("the file: the reference's title, the items in list order", () => {
  const compat = toCompat({
    userFullName: "Daniel Lauzon",
    items: [dominion, { ...dominion, reviewId: "1", bookId: "2" }],
  });
  expect(compat.title).toBe(reference.title);
  expect(compat.title).toBe(FEED_TITLE);
  expect(compat.items.map((item) => item.bookId)).toEqual(["43885149", "2"]);
});
