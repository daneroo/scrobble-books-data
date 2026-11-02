/**
 * The scrape after login, through the page source (seam 1) to the output
 * files (seam 2): fetch → parse → zod → completeness → segments and
 * `goodreads.json` → CUE, and the exit status. No Goodreads calls: pages come
 * from a fake built from the saved, scrubbed list page, with the real
 * shelves and counts.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ScrapeFailure, type FailureMode } from "./failure.ts";
import { createFlow, type FlowEvent } from "./flow/flow.ts";
import { VirtualClock } from "./flow/virtual-clock.ts";
import type { Goodreads } from "./goodreads.ts";
import { listPageUrl } from "./list/scrape.ts";
import { signedInSource } from "./pages/source.ts";
import { report, type Outcome } from "./report.ts";
import { runScrape } from "./run.ts";
import {
  countsOf,
  fakeGoodreads,
  FIXTURE_USER,
  madeUpIds,
  realList,
  renderPage,
  reviewPage,
  rowLike,
  savedRows,
  SAVED_REVIEWS,
  type FakeGoodreads,
  type Override,
  type Row,
} from "./testing/fake-goodreads.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "scrape-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const secrets = {
  email: "reader@example.com",
  password: "pw",
  user: FIXTURE_USER,
};

/** Runs the scrape against `fake` on a virtual clock, with the default flow. */
async function run(
  fake: FakeGoodreads,
  options: { cueSchema?: string; signal?: AbortSignal; cached?: boolean } = {},
) {
  const clock = new VirtualClock();
  const events: FlowEvent[] = [];
  const lines: string[] = [];
  const flow = createFlow(
    { concurrency: 2, ratePerSecond: 2 },
    { clock, random: () => 0.5, onEvent: (event) => events.push(event) },
  );
  const source = (step: "list-pages" | "review-pages", timeoutMs: number) =>
    signedInSource({
      cookie: "session=abc123",
      userAgent: "Mozilla/5.0 Chrome",
      timeoutMs,
      step,
      fetch: fake.fetch,
      clock,
    });
  const publishPath = join(dir, "goodreads.json");
  const dataDir = join(dir, "data");
  const outcome: Outcome = await clock.settle(
    runScrape({
      user: FIXTURE_USER,
      sources: {
        list: source("list-pages", 30_000),
        review: source("review-pages", 15_000),
      },
      cached: options.cached,
      flow,
      dataDir,
      publishPath,
      cueSchema: options.cueSchema,
      signal: options.signal,
      log: (line) => lines.push(line),
    }),
  );
  const published = Bun.file(publishPath);
  return {
    outcome,
    events,
    lines,
    exitCode: report(outcome, secrets).exitCode,
    published: (await published.exists())
      ? ((await published.json()) as Goodreads)
      : undefined,
    segments: async () => (await readdir(join(dataDir, "segments"))).sort(),
    segment: async (name: string) =>
      (await Bun.file(join(dataDir, "segments", name)).json()) as Goodreads,
  };
}

/** The failure of an outcome that should have failed. */
function failedWith(outcome: Outcome) {
  if (outcome.ok) throw new Error("expected the run to fail");
  return outcome.failure;
}

describe("a full run", () => {
  test("fetches all 15 pages and writes all 1450 books, with the real counts", async () => {
    const fake = fakeGoodreads(realList());
    const { outcome, exitCode, published, segments, segment, lines } =
      await run(fake);

    expect(outcome.ok).toBe(true);
    expect(exitCode).toBe(0);
    expect(fake.requests.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    expect(published?.items).toHaveLength(1450);
    expect(new Set(published?.items.map((item) => item.bookId)).size).toBe(
      1450,
    );
    const shelves: Record<string, number> = {};
    for (const item of published?.items ?? [])
      shelves[item.userExclusiveShelf] =
        (shelves[item.userExclusiveShelf] ?? 0) + 1;
    expect(shelves).toEqual({
      "to-read": 448,
      "currently-reading": 8,
      read: 786,
      "on-deck": 208,
    });

    // one segment per list page, in the same schema
    const names = await segments();
    expect(names).toHaveLength(15);
    const sizes = await Promise.all(
      names.map(async (name) => (await segment(name)).items.length),
    );
    expect(sizes).toEqual([...Array<number>(14).fill(100), 50]);

    expect(lines.join("\n")).toContain(
      "counts match the sidebar: to-read 448, currently-reading 8, read 786, did-not-finish 0, on-deck 208; 1450 books on 15 pages",
    );

    // the compatibility file, beside it, in the same order
    const compat = (await Bun.file(join(dir, "goodreads-rss.json")).json()) as {
      title: string;
      items: { bookId: string }[];
    };
    expect(compat.title).toBe("Daniel's bookshelf: all");
    expect(compat.items.map((item) => item.bookId)).toEqual(
      published!.items.map((item) => item.bookId),
    );
  });

  test("the saved page's rows are stored as Goodreads shows them", async () => {
    const { published } = await run(fakeGoodreads(realList()));
    const byReview = new Map(
      published?.items.map((item) => [item.reviewId, item]),
    );

    expect(published?.userFullName).toBe("Pat Reader");
    // the first row: currently reading, unrated, no read date (its review
    // page isn't saved, so its timeline is made up: left out here)
    const { timeline, userDateAddedDay, userReview, ...first } =
      published!.items[0]!;
    expect(timeline).toBeArray();
    expect(userDateAddedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(userReview).toBe("");
    expect(first).toEqual({
      reviewId: "9069353168",
      title: "A Drop of Corruption (Ana and Din Mysteries, #2)",
      bookId: "213618143",
      bookURL:
        "https://www.goodreads.com/book/show/213618143-a-drop-of-corruption",
      bookImageURL:
        "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1723703506l/213618143._SY75_.jpg",
      isbn: "0593723821",
      userRating: 0,
      userReadAtText: "",
      userDateCreatedDay: "2026-11-01",
      userExclusiveShelf: "currently-reading",
      // shown as 4.47; toFixed(1), as the compatibility file (S7)
      averageRating: "4.5",
      bookPublishedText: "Apr 01, 2025",
      numPages: "461",
    });
    // a fractional rating
    expect(byReview.get("9043895547")).toMatchObject({
      title: "Debt: The First 5,000 Years",
      userRating: 4.25,
      userReadAtText: "Oct 29, 2026",
      userDateCreatedDay: "2026-10-21",
      userExclusiveShelf: "read",
      numPages: "534",
    });
    // unknown page count
    expect(byReview.get("8933967943")).toMatchObject({
      title: "Winterfair Gifts (Vorkosigan Saga, #13.1)",
      numPages: "0",
      bookPublishedText: "Jan 01, 2002",
    });
    // no cover, an ISBN ending in X
    expect(byReview.get("8557895838")).toMatchObject({
      bookImageURL:
        "https://s.gr-assets.com/assets/nophoto/book/50x75-1b903c9eac1b2ba789662c08a0ae41e6.png",
      isbn: "139812219X",
      userExclusiveShelf: "on-deck",
      averageRating: "5.0",
    });
    // a read date with no day, and no ISBN
    expect(byReview.get("8977513831")).toMatchObject({
      isbn: "",
      userReadAtText: "Oct 2026",
    });
  });

  test("fetches every book's review page and stores its timeline as shown", async () => {
    const fake = fakeGoodreads(realList());
    const { published, segment } = await run(fake);

    expect(new Set(fake.reviewRequests).size).toBe(1450);
    expect(fake.reviewRequests).toHaveLength(1450);
    // percentages, and the shelves it went through
    const taintedCup = [
      { dateText: "October 23, 2026", event: "Shelved as: to-read" },
      { dateText: "October 23, 2026", event: "Shelved" },
      { dateText: "October 23, 2026", event: "Shelved as: on-deck" },
      { dateText: "October 27, 2026", event: "Started Reading" },
      { dateText: "October 28, 2026", event: "11.0%" },
      { dateText: "October 29, 2026", event: "44.0%" },
      { dateText: "October 30, 2026", event: "72.0%" },
      { dateText: "October 31, 2026", event: "99.0%" },
      { dateText: "October 31, 2026", event: "Finished Reading" },
    ];
    const item = published?.items.find(
      (i) => i.reviewId === SAVED_REVIEWS.taintedCup,
    );
    expect(item?.userExclusiveShelf).toBe("read");
    expect(item?.timeline).toEqual(taintedCup);
    // the segment has it too
    const inSegment = (await segment("list-p01.json")).items.find(
      (i) => i.reviewId === SAVED_REVIEWS.taintedCup,
    );
    expect(inSegment?.timeline).toEqual(taintedCup);
  });

  test("an undated timeline row has dateText '', without the 'Add a date' link (Debt)", async () => {
    const { published } = await run(fakeGoodreads(realList()));
    const debt = published?.items.find(
      (i) => i.reviewId === SAVED_REVIEWS.debt,
    );
    expect(debt?.userRating).toBe(4.25);
    expect(debt?.timeline).toEqual([
      { dateText: "October 21, 2026", event: "Started Reading" },
      { dateText: "October 21, 2026", event: "Shelved" },
      { dateText: "October 21, 2026", event: "Shelved as: on-deck" },
      { dateText: "", event: "Finished Reading" },
      { dateText: "October 26, 2026", event: "Started Reading" },
      { dateText: "October 26, 2026", event: "25.0%" },
      { dateText: "October 27, 2026", event: "52.0%" },
      { dateText: "October 28, 2026", event: "76.0%" },
      { dateText: "October 29, 2026", event: "99.0%" },
      { dateText: "October 29, 2026", event: "Finished Reading" },
    ]);
  });

  test("a re-read of another edition keeps the edition in the event (Essentialism)", async () => {
    const { published } = await run(fakeGoodreads(realList()));
    const essentialism = published?.items.find(
      (i) => i.reviewId === SAVED_REVIEWS.essentialism,
    );
    expect(essentialism?.userExclusiveShelf).toBe("currently-reading");
    // whitespace as a browser shows it: "September  6" in the page
    expect(essentialism?.timeline).toEqual([
      {
        dateText: "May 17, 2023",
        event: "Started Reading (Hardcover Edition)",
      },
      { dateText: "May 17, 2023", event: "Shelved (Hardcover Edition)" },
      {
        dateText: "May 28, 2023",
        event: "Finished Reading (Hardcover Edition)",
      },
      { dateText: "August 17, 2026", event: "Started Reading" },
      { dateText: "August 17, 2026", event: "Shelved" },
      { dateText: "August 23, 2026", event: "14.0%" },
      { dateText: "September 6, 2026", event: "23.0%" },
    ]);
  });

  test("the review date comes from the review page: the read date, or the shelving date", async () => {
    const { published } = await run(fakeGoodreads(realList()));
    const day = (reviewId: string) =>
      published?.items.find((i) => i.reviewId === reviewId)?.userDateAddedDay;
    expect(day(SAVED_REVIEWS.taintedCup)).toBe("2026-10-31");
    expect(day(SAVED_REVIEWS.debt)).toBe("2026-10-29");
    // currently reading: the day it was shelved again
    expect(day(SAVED_REVIEWS.essentialism)).toBe("2026-08-17");
  });

  test("a review is kept as the page source has it: <br />, entities, trimmed", async () => {
    const review =
      "This thoughtful retelling of the West&#39;s heritage &amp; more.<br />Well worth the read.";
    const fake = fakeGoodreads(realList(), {
      review: (row) =>
        row.reviewId === SAVED_REVIEWS.debt
          ? new Response(
              reviewPage(row).replace(
                "</h1>",
                `</h1>\n<div class="reviewText mediumText description readable" itemprop='reviewBody'>\n  \n  ${review}\n</div>`,
              ),
            )
          : undefined,
    });
    const { published } = await run(fake);
    const items = published?.items ?? [];
    expect(
      items.find((i) => i.reviewId === SAVED_REVIEWS.debt)?.userReview,
    ).toBe(review);
    expect(items.filter((i) => i.userReview !== "")).toHaveLength(1);
  });

  test("the list is sorted last updated first, as the RSS feed and the reference were", () => {
    const { searchParams } = new URL(listPageUrl(FIXTURE_USER, 2));
    expect(Object.fromEntries(searchParams)).toEqual({
      shelf: "#ALL#",
      per_page: "100",
      sort: "date_updated",
      order: "d",
      page: "2",
    });
  });

  test("the request sends the cookie and the login browser's User-Agent", async () => {
    const fake = fakeGoodreads(realList());
    await run(fake);
    expect(fake.firstHeaders?.get("cookie")).toBe("session=abc123");
    expect(fake.firstHeaders?.get("user-agent")).toBe("Mozilla/5.0 Chrome");
  });

  test("the log shows the rate achieved for the list and review pages", async () => {
    const { events } = await run(fakeGoodreads(realList()));
    const batches = events.filter((event) => event.type === "batch");
    expect(batches.map((batch) => [batch.batch, batch.requests])).toEqual([
      ["list page 1", 1],
      ["list pages 2-15", 14],
      ["review pages", 1450],
    ]);
  });
});

/** The saved page with the signed-in marker swapped for the signed-out one. */
const signedOutPage = (html: string) =>
  html.replaceAll(":signed_in'", ":signed_out'");

/** A page that never answers: it rejects when the request is aborted. */
const hang = (signal: AbortSignal) =>
  new Promise<Response>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });

/** Asserts the run failed closed: named, exit 1, nothing published. */
async function expectFailedClosed(
  fake: FakeGoodreads,
  mode: FailureMode,
  options: { cueSchema?: string; signal?: AbortSignal; cached?: boolean } = {},
) {
  const result = await run(fake, options);
  const failure = failedWith(result.outcome);
  expect(failure.mode).toBe(mode);
  expect(result.exitCode).toBe(1);
  expect(result.published).toBeUndefined();
  expect(await Bun.file(join(dir, "goodreads-rss.json")).exists()).toBe(false);
  expect(await Bun.file(join(dir, "goodreads.json.tmp")).exists()).toBe(false);
  return { ...result, failure };
}

/** Answers page `page` (every attempt) with `respond`. */
const onPage =
  (
    page: number,
    respond: (signal: AbortSignal) => Response | Promise<Response>,
  ): Override =>
  (requested, _request, signal) =>
    requested === page ? respond(signal) : undefined;

describe("fail-closed, through the page source", () => {
  test("a 302 to sign-in is redirect-to-sign-in", async () => {
    const fake = fakeGoodreads(realList(), {
      override: onPage(
        1,
        () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://www.goodreads.com/user/sign_in" },
          }),
      ),
    });
    const { failure } = await expectFailedClosed(fake, "redirect-to-sign-in");
    expect(failure.detail).toContain("/user/sign_in");
    expect(fake.requests).toEqual([1]);
  });

  test("a 202 WAF challenge is waf-challenge, not retried", async () => {
    const fake = fakeGoodreads(realList(), {
      override: onPage(
        3,
        () =>
          new Response("<script>window.awsWafCookieDomainList = [];</script>", {
            status: 202,
          }),
      ),
    });
    await expectFailedClosed(fake, "waf-challenge");
    expect(fake.requests.filter((page) => page === 3)).toHaveLength(1);
  });

  test("a signed-out 200 is signed-out", async () => {
    const fake = fakeGoodreads(realList(), {
      override: async (page, request, signal) => {
        if (page !== 2) return undefined;
        const ok = await fakeGoodreads(realList()).fetch(
          `https://www.goodreads.com/review/list/${FIXTURE_USER}?page=2`,
          { signal },
        );
        return new Response(signedOutPage(await ok.text()), { status: 200 });
      },
    });
    await expectFailedClosed(fake, "signed-out");
  });

  test("a 4xx is http-error, not retried", async () => {
    const fake = fakeGoodreads(realList(), {
      override: onPage(5, () => new Response("gone", { status: 404 })),
    });
    const { failure } = await expectFailedClosed(fake, "http-error");
    expect(failure.status).toBe(404);
    expect(fake.requests.filter((page) => page === 5)).toHaveLength(1);
  });

  test("a 429 is retried with its Retry-After, then too-many-requests", async () => {
    const fake = fakeGoodreads(realList(), {
      override: onPage(
        1,
        () =>
          new Response("slow down", {
            status: 429,
            headers: { "retry-after": "10" },
          }),
      ),
    });
    const { events } = await expectFailedClosed(fake, "too-many-requests");
    expect(fake.requests).toEqual([1, 1, 1, 1, 1, 1]);
    const retries = events.filter((event) => event.type === "retry");
    expect(retries.map((event) => event.delayMs)).toEqual([
      10_000, 10_000, 10_000, 10_000, 10_000,
    ]);
  });

  test("a 503 is retried, then server-error", async () => {
    const fake = fakeGoodreads(realList(), {
      override: onPage(4, () => new Response("busy", { status: 503 })),
    });
    await expectFailedClosed(fake, "server-error");
    expect(fake.requests.filter((page) => page === 4)).toHaveLength(6);
  });

  test("a 503 that clears on retry is fine", async () => {
    const fake = fakeGoodreads(realList(), {
      override: (page) =>
        page === 4 && fake.requests.filter((p) => p === 4).length === 1
          ? new Response("busy", { status: 503 })
          : undefined,
    });
    const { outcome } = await run(fake);
    expect(outcome.ok).toBe(true);
  });

  test("a page that never answers times out, is retried, then timeout", async () => {
    const fake = fakeGoodreads(realList(), { override: onPage(2, hang) });
    const { failure } = await expectFailedClosed(fake, "timeout");
    expect(failure.detail).toContain("30s");
    expect(failure.detail).toContain("page 2");
    expect(fake.requests.filter((page) => page === 2)).toHaveLength(6);
  });

  test("a network error is retried, then network-error", async () => {
    const fake = fakeGoodreads(realList(), {
      override: onPage(2, () =>
        Promise.reject(new TypeError("connection reset")),
      ),
    });
    await expectFailedClosed(fake, "network-error");
    expect(fake.requests.filter((page) => page === 2)).toHaveLength(6);
  });
});

/** `list` with row `index`'s markup changed by `edit`. */
function editRow(
  list: Row[],
  index: number,
  edit: (html: string) => string,
): Row[] {
  const row = list[index]!;
  const html = edit(row.html);
  if (html === row.html)
    throw new Error(`the edit changed nothing in row ${index}`);
  list[index] = { ...row, html };
  return list;
}

/** The index in the real list of the saved row with this review id. */
const savedIndex = (reviewId: string) =>
  savedRows.findIndex((row) => row.reviewId === reviewId);

describe("rows", () => {
  test("a book not yet published can't be rated: its rating is 0", async () => {
    // markup as on the real page 2 (Six Math Essentials)
    const list = editRow(realList(), 0, (html) =>
      html.replace(
        /<div class="stars"[^>]*>/,
        '<div class="stars" data-pre-release="true">',
      ),
    );
    const { published } = await run(fakeGoodreads(list));
    expect(published?.items[0]?.userRating).toBe(0);
  });

  test("a book read more than once keeps the newest read date, shown first", async () => {
    const list = editRow(realList(), savedIndex("9043895547"), (html) =>
      html.replace(
        '<span class="date_read_value">Oct 29, 2026</span>',
        '<span class="date_read_value">Oct 29, 2026</span></div><div><span class="date_read_value">Mar 2019</span>',
      ),
    );
    const { published } = await run(fakeGoodreads(list));
    const debt = published?.items.find(
      (item) => item.reviewId === "9043895547",
    );
    expect(debt?.userReadAtText).toBe("Oct 29, 2026");
  });
});

describe("fail-closed, parsing", () => {
  test("a value that fails its schema is parse-failure, naming the page and row", async () => {
    const list = editRow(realList(), 100, (html) =>
      html.replace(/data-rating="[^"]*"/, 'data-rating="lots"'),
    );
    const { failure } = await expectFailedClosed(
      fakeGoodreads(list),
      "parse-failure",
    );
    expect(failure.detail).toContain(
      `list page 2, row 1 (review_${list[100]!.reviewId})`,
    );
    expect(failure.detail).toContain("userRating");
    expect(failure.detail).toContain('"lots"');
  });

  test("a missing cell is layout-change, naming the page and row", async () => {
    const list = editRow(realList(), 205, (html) =>
      html.replace(/<td class="field isbn"[\s\S]*?<\/td>/, ""),
    );
    const { failure } = await expectFailedClosed(
      fakeGoodreads(list),
      "layout-change",
    );
    expect(failure.detail).toContain("list page 3, row 6");
    expect(failure.detail).toContain("isbn");
  });

  test("a book on a non-exclusive shelf too is parse-failure: it isn't stored yet", async () => {
    // long-term is the real non-exclusive shelf in the sidebar (0 books)
    const list = editRow(realList(), 0, (html) =>
      html.replace(
        /(<a class="shelfLink"[^>]*>[^<]*<\/a>)/,
        '$1<a class="shelfLink" href="https://www.goodreads.com/review/list/1000000?shelf=long-term">long-term</a>',
      ),
    );
    const { failure } = await expectFailedClosed(
      fakeGoodreads(list),
      "parse-failure",
    );
    expect(failure.detail).toContain("list page 1, row 1");
    expect(failure.detail).toContain("long-term");
  });

  test("a page with no sidebar is layout-change", async () => {
    const fake = fakeGoodreads(realList(), {
      override: async (page, _request, signal) => {
        if (page !== 1) return undefined;
        const ok = await fakeGoodreads(realList()).fetch(
          `https://www.goodreads.com/review/list/${FIXTURE_USER}?page=1`,
          { signal },
        );
        const html = (await ok.text()).replace(
          'id="paginatedShelfList"',
          'id="somethingElse"',
        );
        return new Response(html, { status: 200 });
      },
    });
    const { failure } = await expectFailedClosed(fake, "layout-change");
    expect(failure.detail).toContain("list page 1");
  });
});

describe("fail-closed, completeness", () => {
  test("a list that shifts mid-scrape, a duplicate hiding a gap, is count-mismatch", async () => {
    // after page 5, a book from page 8 moves to the top (already fetched):
    // page 6 repeats page 5's last book, and the moved book is never seen.
    // The row count stays 1450, and the sidebar doesn't change.
    let moved = false;
    const fake = fakeGoodreads(realList(), {
      before(page, list) {
        if (page !== 6 || moved) return;
        moved = true;
        const [book] = list.splice(750, 1);
        list.unshift(book!);
      },
    });
    const { failure } = await expectFailedClosed(fake, "count-mismatch");
    expect(failure.step).toBe("checks");
    expect(failure.detail).toContain("listed twice");
    expect(failure.detail).toContain("on pages 5 and 6");
  });

  test("a book added mid-scrape changes the sidebar: count-mismatch", async () => {
    let added = false;
    const fake = fakeGoodreads(realList(), {
      before(page, list) {
        if (page !== 4 || added) return;
        added = true;
        list.unshift(rowLike(savedRows[1]!, madeUpIds(9999), "to-read"));
      },
    });
    const { failure } = await expectFailedClosed(fake, "count-mismatch");
    expect(failure.detail).toContain("the list changed during the run");
    expect(failure.detail).toContain("to-read 449");
  });

  test("fewer books on a shelf than its sidebar count is count-mismatch", async () => {
    const list = realList();
    const missing = list.findIndex(
      (row, i) => i >= 100 && row.shelf === "to-read",
    );
    list.splice(missing, 1);
    const fake = fakeGoodreads(list, { counts: countsOf(realList()) });
    const { failure } = await expectFailedClosed(fake, "count-mismatch");
    expect(failure.detail).toContain("to-read 447 (sidebar 448)");
  });

  test("a page other than the last with 99 rows is page-size", async () => {
    const list = realList();
    const fake = fakeGoodreads(list, {
      override: (page) =>
        page === 3
          ? new Response(renderPage(list.slice(200, 299), countsOf(list)))
          : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "page-size");
    expect(failure.detail).toContain("list page 3 has 99 rows");
  });

  test("a book listed twice, with the counts still right, is duplicate-book", async () => {
    const list = realList();
    const fake = fakeGoodreads(list, {
      override: (page) =>
        page === 15
          ? new Response(
              renderPage([...list.slice(1400), list[1399]!], countsOf(list)),
            )
          : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "duplicate-book");
    expect(failure.detail).toContain(
      `book ${list[1399]!.bookId} on pages 14 and 15`,
    );
  });

  test("a sidebar with no books is empty-run", async () => {
    const empty = {
      "to-read": 0,
      "currently-reading": 0,
      read: 0,
      "did-not-finish": 0,
      "on-deck": 0,
    };
    const fake = fakeGoodreads([], { counts: empty });
    await expectFailedClosed(fake, "empty-run");
    expect(fake.requests).toEqual([1]);
  });

  test("a sidebar past the 400-page ceiling is page-limit, before fetching more", async () => {
    const fake = fakeGoodreads(realList(), {
      counts: { ...countsOf(realList()), read: 40_001 },
    });
    await expectFailedClosed(fake, "page-limit");
    expect(fake.requests).toEqual([1]);
  });
});

describe("fail-closed, review pages", () => {
  test("a review page shelf that differs from the list page's is shelf-mismatch", async () => {
    const list = realList();
    const book = list[150]!;
    const other = book.shelf === "read" ? "to-read" : "read";
    const fake = fakeGoodreads(list, {
      review: (row) =>
        row.reviewId === book.reviewId
          ? new Response(reviewPage({ ...row, shelf: other }))
          : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "shelf-mismatch");
    expect(failure.step).toBe("checks");
    expect(failure.detail).toBe(
      `book ${book.bookId} (review ${book.reviewId}) is ${book.shelf} on the list page, ${other} on its review page`,
    );
  });

  test("a review page redirected to sign-in is redirect-to-sign-in; its body is kept", async () => {
    const list = realList();
    const book = list[700]!;
    const fake = fakeGoodreads(list, {
      review: (row) =>
        row.reviewId === book.reviewId
          ? new Response("moved", {
              status: 302,
              headers: { location: "https://www.goodreads.com/user/sign_in" },
            })
          : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "redirect-to-sign-in");
    expect(failure.step).toBe("review-pages");
    expect(failure.detail).toContain(`/review/show/${book.reviewId}`);
    const kept = Bun.file(
      join(dir, "data", "pages", `review-${book.reviewId}.html`),
    );
    expect(await kept.text()).toBe("moved");
  });

  test("a review page that never answers times out at 15s, is retried, then timeout", async () => {
    const book = realList()[3]!;
    const fake = fakeGoodreads(realList(), {
      review: (row, signal) =>
        row.reviewId === book.reviewId ? hang(signal) : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "timeout");
    expect(failure.detail).toContain(`/review/show/${book.reviewId}`);
    expect(failure.detail).toContain("15s");
    expect(
      fake.reviewRequests.filter((id) => id === book.reviewId),
    ).toHaveLength(6);
  });

  test("a review page with no shelf in its heading is layout-change, naming it", async () => {
    const book = realList()[42]!;
    const fake = fakeGoodreads(realList(), {
      review: (row) =>
        row.reviewId === book.reviewId
          ? new Response(
              reviewPage(row).replace(/\?shelf=[a-z-]+/, "?sort=title"),
            )
          : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "layout-change");
    expect(failure.detail).toBe(
      `review page ${book.reviewId}: no shelf link in the heading`,
    );
  });

  test("a review page with no reading timeline is layout-change", async () => {
    const book = realList()[42]!;
    const fake = fakeGoodreads(realList(), {
      review: (row) =>
        row.reviewId === book.reviewId
          ? new Response(
              reviewPage(row).replace(
                'class="readingTimeline"',
                'class="somethingElse"',
              ),
            )
          : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "layout-change");
    expect(failure.detail).toBe(
      `review page ${book.reviewId}: no reading timeline`,
    );
  });

  test("a partial timeline date (a year, or a month and year) is stored as shown", async () => {
    // as on real review pages: "2021 – Finished Reading" (4090256573) and
    // "January, 1997" (3846910217)
    const book = realList()[42]!;
    const fake = fakeGoodreads(realList(), {
      review: (row) =>
        row.reviewId === book.reviewId
          ? new Response(
              reviewPage(row)
                .replace("October 26, 2026", "2021")
                .replace("October 27, 2026", "January, 1997"),
            )
          : undefined,
    });
    const { published } = await run(fake);
    const item = published?.items.find((i) => i.reviewId === book.reviewId);
    expect(item?.timeline[4]).toEqual({
      dateText: "2021",
      event: "Started Reading",
    });
    expect(item?.timeline[6]).toEqual({
      dateText: "January, 1997",
      event: "52.0%",
    });
  });

  test("a timeline date in another format is parse-failure, naming the page and row", async () => {
    const book = realList()[42]!;
    const fake = fakeGoodreads(realList(), {
      review: (row) =>
        row.reviewId === book.reviewId
          ? new Response(
              reviewPage(row).replace("October 26, 2026", "2026-10-26"),
            )
          : undefined,
    });
    const { failure } = await expectFailedClosed(fake, "parse-failure");
    expect(failure.detail).toContain(
      `review page ${book.reviewId}: timeline row 5: dateText`,
    );
    expect(failure.detail).toContain('"2026-10-26"');
  });
});

describe("fail-closed, outputs", () => {
  test("a CUE failure is cue-failure, and nothing is published", async () => {
    const schema = join(dir, "strict.cue");
    await Bun.write(schema, 'items: [...{numPages: "1"}]\n');
    const { failure } = await expectFailedClosed(
      fakeGoodreads(realList()),
      "cue-failure",
      {
        cueSchema: schema,
      },
    );
    expect(failure.step).toBe("outputs");
    expect(failure.detail).toContain("numPages");
  });

  test("the segments and raw pages stay in the data directory after a failure", async () => {
    const schema = join(dir, "strict.cue");
    await Bun.write(schema, 'items: [...{numPages: "1"}]\n');
    await expectFailedClosed(fakeGoodreads(realList()), "cue-failure", {
      cueSchema: schema,
    });
    expect((await readdir(join(dir, "data", "segments"))).length).toBe(15);
    // 15 list pages and 1450 review pages
    expect((await readdir(join(dir, "data", "pages"))).length).toBe(1465);
  });
});

describe("--cached: a read-through cache of the raw pages", () => {
  const pagesDir = () => join(dir, "data", "pages");

  test("a second run with every page saved fetches nothing, and writes the same goodreads.json", async () => {
    const first = await run(fakeGoodreads(realList()));
    const again = fakeGoodreads(realList());
    const second = await run(again, { cached: true });

    expect(second.outcome.ok).toBe(true);
    expect(again.requests).toEqual([]);
    expect(again.reviewRequests).toEqual([]);
    expect(second.published).toEqual(first.published!);
    expect(await second.segments()).toHaveLength(15);
    expect((await readdir(pagesDir())).length).toBe(1465);
  });

  test("a page not saved is fetched and saved; the saved ones are not", async () => {
    await run(fakeGoodreads(realList()));
    await unlink(join(pagesDir(), "list-p03.html"));
    await unlink(join(pagesDir(), `review-${SAVED_REVIEWS.debt}.html`));
    const again = fakeGoodreads(realList());
    const { outcome } = await run(again, { cached: true });

    expect(outcome.ok).toBe(true);
    expect(again.requests).toEqual([3]);
    expect(again.reviewRequests).toEqual([SAVED_REVIEWS.debt]);
    expect(await Bun.file(join(pagesDir(), "list-p03.html")).exists()).toBe(
      true,
    );
  });

  test("a saved rejected page fails as a fetched one does", async () => {
    await run(fakeGoodreads(realList()));
    await Bun.write(join(pagesDir(), "list-p02.html"), "gone");
    const again = fakeGoodreads(realList());
    const { outcome, exitCode } = await run(again, { cached: true });

    const failure = failedWith(outcome);
    expect([failure.mode, failure.step, exitCode]).toEqual([
      "layout-change",
      "list-pages",
      1,
    ]);
    expect(failure.detail).toContain("page 2");
    expect(again.requests).toEqual([]);
  });

  test("without it, the saved pages are cleared and every page is fetched", async () => {
    await run(fakeGoodreads(realList()));
    await Bun.write(join(pagesDir(), "review-1.html"), "stale");
    const again = fakeGoodreads(realList());
    await run(again);

    expect(again.requests).toHaveLength(15);
    expect(again.reviewRequests).toHaveLength(1450);
    expect(await Bun.file(join(pagesDir(), "review-1.html")).exists()).toBe(
      false,
    );
  });
});

describe("debugging and the deadline", () => {
  test("a rejected page's body is kept with the raw pages", async () => {
    const fake = fakeGoodreads(realList(), {
      override: onPage(2, () => new Response("gone", { status: 404 })),
    });
    await expectFailedClosed(fake, "http-error");
    const kept = Bun.file(join(dir, "data", "pages", "list-p02.html"));
    expect(await kept.text()).toBe("gone");
  });

  test("the run deadline, passed before the outputs, is run-timeout: nothing published", async () => {
    const deadline = new AbortController();
    const fake = fakeGoodreads(realList(), {
      before: (page) => {
        if (page === 15)
          deadline.abort(
            new ScrapeFailure({
              step: "list-pages",
              mode: "run-timeout",
              detail: "30 min",
            }),
          );
      },
    });
    const { failure } = await expectFailedClosed(fake, "run-timeout", {
      signal: deadline.signal,
    });
    expect(failure.step).toBe("outputs");
  });
});
