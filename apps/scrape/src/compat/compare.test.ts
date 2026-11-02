import { describe, expect, test } from "bun:test";

import { compare, identical, listDifferences, summarize } from "./compare.ts";
import type { Compat, CompatItem } from "./mapping.ts";

const item = (
  bookId: string,
  fields: Partial<CompatItem> = {},
): CompatItem => ({
  id: `https://www.goodreads.com/review/show/${bookId}0`,
  title: `Book ${bookId}`,
  link: `https://www.goodreads.com/review/show/${bookId}0`,
  bookId,
  bookImageURL: "https://i.gr-assets.com/x.jpg",
  bookDescription: "",
  authorName: "An Author",
  isbn: "",
  userName: "Daniel",
  userRating: "0",
  userReadAt: "",
  userDateAdded: "2026-10-01T00:00:00.000Z",
  userDateCreated: "2026-10-01T00:00:00.000Z",
  userShelves: "to-read",
  userReview: "",
  averageRating: "4.0",
  bookPublished: "2001",
  description: "",
  numPages: "100",
  ...fields,
});
const file = (...items: CompatItem[]): Compat => ({
  title: "Daniel's bookshelf: all",
  items,
});

describe("compare", () => {
  test("the same file is identical", () => {
    const ref = file(item("1"), item("2"));
    const result = compare(ref, structuredClone(ref));
    expect(identical(result)).toBe(true);
    expect(result.differences).toEqual([]);
  });

  test("every field that differs is listed, exactly: no tolerance", () => {
    const result = compare(
      file(item("1"), item("2")),
      file(
        item("1", { averageRating: "4.1", userShelves: "" }),
        item("2", { authorName: "An  Author" }),
      ),
    );
    expect(identical(result)).toBe(false);
    expect(
      result.differences.map(({ bookId, field, reference, output }) => [
        bookId,
        field,
        reference,
        output,
      ]),
    ).toEqual([
      ["1", "userShelves", "to-read", ""],
      ["1", "averageRating", "4.0", "4.1"],
      ["2", "authorName", "An Author", "An  Author"],
    ]);
    expect(listDifferences(result)[0]).toBe(
      '1\tuserShelves\t"to-read" → ""\tBook 1',
    );
  });

  test("books missing from the output and new ones are named", () => {
    const result = compare(
      file(item("1"), item("2")),
      file(item("3"), item("1")),
    );
    expect(result.missing).toEqual([{ bookId: "2", title: "Book 2" }]);
    expect(result.added).toEqual([{ bookId: "3", title: "Book 3" }]);
    expect(result.moved).toEqual([]);
    expect(summarize(result)).toContain("missing from the output: 1");
    expect(summarize(result)).toContain("  2 Book 2");
  });

  test("a different order or title is a difference", () => {
    const reordered = compare(
      file(item("1"), item("2")),
      file(item("2"), item("1")),
    );
    // a swap: either book could be named; one is
    expect(reordered.moved).toHaveLength(1);
    expect(identical(reordered)).toBe(false);
    const retitled = compare(file(item("1")), {
      ...file(item("1")),
      title: "x",
    });
    expect(retitled.title?.output).toBe("x");
    expect(identical(retitled)).toBe(false);
  });

  test("only the books that moved are named, not the ones shifted by them", () => {
    const ref = file(...["1", "2", "3", "4", "5"].map((id) => item(id)));
    const moved = compare(
      ref,
      file(...["4", "1", "2", "3", "5"].map((id) => item(id))),
    );
    expect(moved.moved).toEqual([{ bookId: "4", title: "Book 4" }]);
  });

  test("a field present on one side only is listed as absent", () => {
    const extra = { ...item("1"), extra: "x" } as unknown as CompatItem;
    const result = compare(file(item("1")), file(extra));
    expect(result.differences).toEqual([
      {
        bookId: "1",
        title: "Book 1",
        field: "extra" as keyof CompatItem,
        reference: "(absent)",
        output: "x",
      },
    ]);
  });
});
