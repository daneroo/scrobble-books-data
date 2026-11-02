import { describe, expect, test } from "bun:test";

import {
  compare,
  identical,
  listChanged,
  listDifferences,
  listExplained,
  pacificDay,
  summarize,
} from "./compare.ts";
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
  userDateAdded: "2026-10-01T19:00:00.000Z",
  userDateCreated: "2026-10-01T19:00:00.000Z",
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

  test("a missing book and a new one with the same title are a changed bookId", () => {
    const result = compare(
      file(item("1"), item("2")),
      file(item("1"), item("5", { title: "Book 2" })),
    );
    expect(result.changed).toEqual([{ from: "2", to: "5", title: "Book 2" }]);
    expect(listChanged(result)).toEqual([
      "changed bookIds (same title): 1",
      "  2 → 5 Book 2",
    ]);
    expect(summarize(result)).toContain("  2 → 5 Book 2");
  });

  test("a changed bookId's two books are compared field by field", () => {
    const result = compare(
      file(item("1"), item("2", { averageRating: "0.0" })),
      file(item("1"), item("5", { title: "Book 2", averageRating: "5.0" })),
    );
    const pair = result.differences.filter(({ bookId }) => bookId === "2");
    expect(pair.map(({ field }) => field)).toContain("bookId");
    expect(pair).toContainEqual({
      bookId: "2",
      title: "Book 2",
      field: "averageRating",
      reference: "0.0",
      output: "5.0",
    });
  });

  test("a changed bookId that moved is listed as moved", () => {
    const result = compare(
      file(item("1"), item("2"), item("3")),
      file(item("5", { title: "Book 3" }), item("1"), item("2")),
    );
    expect(result.moved).toEqual([{ bookId: "5", title: "Book 3" }]);
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

  test("the two dates are compared by their America/Los_Angeles day, not the time", () => {
    // Debt in the reference: 06:58 UTC is 23:58 the day before in Pacific time
    const ref = file(
      item("1", {
        userDateAdded: "2026-10-27T06:58:07.000Z",
        userDateCreated: "2026-10-21T20:24:32.000Z",
      }),
    );
    const sameDays = compare(
      ref,
      file(
        item("1", {
          userDateAdded: "2026-10-26T00:00:00.000Z",
          userDateCreated: "2026-10-21T00:00:00.000Z",
        }),
      ),
    );
    expect(sameDays.differences).toEqual([]);

    const otherDay = compare(
      ref,
      file(
        item("1", {
          userDateAdded: "2026-10-29T00:00:00.000Z",
          userDateCreated: "2026-10-21T00:00:00.000Z",
        }),
      ),
    );
    // another day: a difference (here explained, after the cutoff)
    expect(otherDay.differences).toEqual([]);
    expect(otherDay.explained).toEqual([
      {
        bookId: "1",
        title: "Book 1",
        field: "userDateAdded",
        reference: "2026-10-26 (2026-10-27T06:58:07.000Z)",
        output: "2026-10-29 (2026-10-29T00:00:00.000Z)",
        rule: "changed after the cutoff",
        reason: "changed after the cutoff",
      },
    ]);
  });

  test("daylight saving time: −7 in summer, −8 in winter, by the named zone", () => {
    // 07:30 UTC: 00:30 Pacific in summer (PDT, −7), 23:30 the day before in
    // winter (PST, −8); a fixed −7 would put the winter one on the 15th
    expect(pacificDay("2026-07-15T07:30:00.000Z")).toBe("2026-07-15");
    expect(pacificDay("2026-01-15T07:30:00.000Z")).toBe("2026-01-14");
    // the switch back to PST, 2026-11-01 at 09:00 UTC
    expect(pacificDay("2026-11-01T07:30:00.000Z")).toBe("2026-11-01");
    expect(pacificDay("2026-11-02T07:30:00.000Z")).toBe("2026-11-01");
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

describe("dates: explained differences (real books of the 2026-11-02 run)", () => {
  test("changed after the cutoff: Debt, read on 2026-10-29", () => {
    const debt = {
      title: "Debt: The First 5,000 Years",
      userDateCreated: "2026-10-21T20:24:32.000Z",
    };
    const result = compare(
      file(
        item("6617037", {
          ...debt,
          userDateAdded: "2026-10-27T06:58:07.000Z",
          userReadAt: "",
        }),
      ),
      file(
        item("6617037", {
          ...debt,
          userDateCreated: "2026-10-21T00:00:00.000Z",
          userDateAdded: "2026-10-29T00:00:00.000Z",
          userReadAt: "2026-10-29T00:00:00.000Z",
        }),
      ),
    );
    expect(result.differences).toEqual([]);
    expect(
      result.explained.map(({ field, rule, reason }) => [field, rule, reason]),
    ).toEqual([
      ["userReadAt", "changed after the cutoff", "changed after the cutoff"],
      ["userDateAdded", "changed after the cutoff", "changed after the cutoff"],
    ]);
    expect(listExplained(result)).toContain(
      '6617037\tuserDateAdded\t"2026-10-26 (2026-10-27T06:58:07.000Z)" → "2026-10-29 (2026-10-29T00:00:00.000Z)"\tchanged after the cutoff\tDebt: The First 5,000 Years',
    );
  });

  test("timeline event on the reference day: Cryptonomicon, finished 2025-02-12", () => {
    const cryptonomicon = {
      title: "Cryptonomicon",
      userReadAt: "2025-02-12T00:00:00.000Z",
    };
    const timeline = [
      { dateText: "", event: "Finished Reading" },
      { dateText: "November 5, 2011", event: "Shelved" },
      { dateText: "February 3, 2025", event: "Started Reading" },
      { dateText: "February 4, 2025", event: "9.0%" },
      { dateText: "February 5, 2025", event: "19.0%" },
      { dateText: "February 6, 2025", event: "33.0%" },
      { dateText: "February 7, 2025", event: "46.0%" },
      { dateText: "February 8, 2025", event: "60.0%" },
      { dateText: "February 9, 2025", event: "66.0%" },
      { dateText: "February 10, 2025", event: "74.0%" },
      { dateText: "February 12, 2025", event: "99.0%" },
      { dateText: "February 12, 2025", event: "Finished Reading" },
    ];
    const result = compare(
      file(
        item("816", {
          ...cryptonomicon,
          userDateAdded: "2025-02-12T08:10:08.000Z",
          userDateCreated: "2011-11-05T07:19:46.000Z",
        }),
      ),
      file(
        item("816", {
          ...cryptonomicon,
          userDateAdded: "2011-11-05T00:00:00.000Z",
          userDateCreated: "2011-11-05T00:00:00.000Z",
        }),
      ),
      new Map([["816", timeline]]),
    );
    expect(result.differences).toEqual([]);
    expect(result.explained).toEqual([
      {
        bookId: "816",
        title: "Cryptonomicon",
        field: "userDateAdded",
        reference: "2025-02-12 (2025-02-12T08:10:08.000Z)",
        output: "2011-11-05 (2011-11-05T00:00:00.000Z)",
        rule: "timeline event",
        reason: "last updated 2025-02-12: 99.0%, Finished Reading",
      },
    ]);
    // userReadAt is already a day in the reference: no Pacific conversion
    expect(result.explained.map(({ field }) => field)).not.toContain(
      "userReadAt",
    );
  });

  test("unexplained: Broken China 248051399, no timeline entry on 2026-09-29", () => {
    const brokenChina = {
      title:
        "Broken China: How the Economic Miracle Shattered and What it Means for the World",
      userReadAt: "",
    };
    const result = compare(
      file(
        item("248051399", {
          ...brokenChina,
          userDateAdded: "2026-09-30T04:00:49.000Z",
          userDateCreated: "2026-09-01T05:44:21.000Z",
        }),
      ),
      file(
        item("248051399", {
          ...brokenChina,
          userDateAdded: "2026-08-31T00:00:00.000Z",
          userDateCreated: "2026-08-31T00:00:00.000Z",
        }),
      ),
      new Map([
        [
          "248051399",
          [
            { dateText: "August 31, 2026", event: "Shelved as: on-deck" },
            { dateText: "August 31, 2026", event: "Shelved" },
          ],
        ],
      ]),
    );
    expect(result.explained).toEqual([]);
    expect(result.differences).toEqual([
      {
        bookId: "248051399",
        title: brokenChina.title,
        field: "userDateAdded",
        reference: "2026-09-29 (2026-09-30T04:00:49.000Z)",
        output: "2026-08-31 (2026-08-31T00:00:00.000Z)",
      },
    ]);
    expect(summarize(result)).toContain(
      "unexplained differences: 1 fields, in 1 of the books in both",
    );
  });
});
