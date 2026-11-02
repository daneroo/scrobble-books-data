/**
 * For tests: a fake Goodreads that serves list pages built from the saved,
 * scrubbed list page (`fixtures/list-page-1.html`), and review pages, with
 * no network.
 *
 * The list holds only the real exclusive shelves with their real counts as
 * seen in #28: to-read 448, currently-reading 8, read 786, did-not-finish 0,
 * on-deck 208, 1450 books. Page 1 is the saved page itself; the other rows
 * are its rows again, under new review and book ids, on the shelves needed
 * to reach those counts.
 */
import { join } from "node:path";

import type { ExclusiveShelf } from "../goodreads.ts";

export const FIXTURE = join(import.meta.dir, "../../fixtures/list-page-1.html");

/**
 * The saved, scrubbed review pages of the three spot-check books, by review
 * id; all three are on the saved list page.
 */
export const SAVED_REVIEWS = {
  /** _The Tainted Cup_: read, with percentages. */
  taintedCup: "9048822166",
  /** _Debt_: read, an undated "Finished Reading" row. */
  debt: "9043895547",
  /** _Essentialism_: currently reading, a re-read of another edition. */
  essentialism: "8869640622",
} as const;

const reviewFixtures = new Map<string, string>(
  await Promise.all(
    Object.values(SAVED_REVIEWS).map(
      async (id) =>
        [
          id,
          await Bun.file(
            join(import.meta.dir, `../../fixtures/review-${id}.html`),
          ).text(),
        ] as const,
    ),
  ),
);

/** The part of `html` that `pattern` matches; it must match. */
function part(html: string, pattern: RegExp): string {
  const match = pattern.exec(html)?.[0];
  if (match === undefined) throw new Error(`review fixture: no ${pattern}`);
  return match;
}

/**
 * A slim review page made of _Debt_'s saved page parts: its signed-in
 * marker script, its heading, its review date and its Reading Progress box. Served for every
 * book without a saved page, so a full run stays fast.
 */
const slimReviewPage = (() => {
  const debt = reviewFixtures.get(SAVED_REVIEWS.debt)!;
  const marker = part(debt, /<script[^>]*>[^<]*:signed_in'[\s\S]*?<\/script>/);
  const heading = part(debt, /<h1>[\s\S]*?<\/h1>/);
  const reviewDate = part(
    debt,
    /<div class="right dtreviewed[\s\S]*?<span class="value-title" title="[\d-]+"><\/span>\s*<\/div>/,
  );
  const progress = part(
    debt,
    /<div class=" clearFloats bigBox"><div class="h2Container gradientHeaderContainer"><h2 class="brownBackground">Reading Progress[\s\S]*?<div class="bigBoxBottom"><\/div><\/div>/,
  );
  return `<!DOCTYPE html>\n<html>\n<head>\n${marker}\n</head>\n<body>\n${heading}\n${reviewDate}\n${progress}\n</body>\n</html>\n`;
})();

/**
 * A book's review page: its saved page if there is one, otherwise the slim
 * page with the heading's shelf set to the book's shelf.
 */
export function reviewPage(row: Row): string {
  const saved = reviewFixtures.get(row.reviewId);
  if (saved !== undefined) return saved;
  return slimReviewPage.replace(
    /(<h1><a href="[^"]*\?shelf=)read"/,
    `$1${row.shelf}"`,
  );
}

/** The user id in the scrubbed fixture. */
export const FIXTURE_USER = "1000000";

/** The real counts (#28), in sidebar order. */
export const REAL_COUNTS: Readonly<Record<ExclusiveShelf, number>> = {
  "to-read": 448,
  "currently-reading": 8,
  read: 786,
  "did-not-finish": 0,
  "on-deck": 208,
};

/** One list row: its markup and what it stands for. */
export interface Row {
  reviewId: string;
  bookId: string;
  shelf: ExclusiveShelf;
  html: string;
}

const fixture = await Bun.file(FIXTURE).text();
const firstRow = fixture.indexOf('<tr id="review_');
const afterLastRow = fixture.lastIndexOf("</tr>") + "</tr>".length;
const head = fixture.slice(0, firstRow);
const tail = fixture.slice(afterLastRow);

/** The saved page's 100 rows, as they are. */
export const savedRows: readonly Row[] = [
  ...fixture
    .slice(firstRow, afterLastRow)
    .matchAll(/<tr id="review_(\d+)"[\s\S]*?<\/tr>/g),
].map((match) => {
  const html = match[0];
  const bookId = /data-resource-id="(\d+)"/.exec(html)?.[1];
  const shelf = /<a class="shelfLink"[^>]*>([^<]*)<\/a>/.exec(html)?.[1];
  if (bookId === undefined || shelf === undefined)
    throw new Error(`fixture row ${match[1]}: no book id or shelf`);
  return { reviewId: match[1]!, bookId, shelf: shelf as ExclusiveShelf, html };
});

/** Replaces a whole number (not part of a longer one) everywhere. */
function replaceId(html: string, from: string, to: string): string {
  return html.replace(new RegExp(`(?<!\\d)${from}(?!\\d)`, "g"), to);
}

/** A row like `row`, under new ids and on `shelf`. */
export function rowLike(
  row: Row,
  ids: { reviewId: string; bookId: string },
  shelf: ExclusiveShelf = row.shelf,
): Row {
  let html = replaceId(row.html, row.reviewId, ids.reviewId);
  html = replaceId(html, row.bookId, ids.bookId);
  html = html.replace(
    /(<a class="shelfLink"[^>]*href="[^"]*shelf=)[^"]*("[^>]*>)[^<]*(<\/a>)/,
    `$1${shelf}$2${shelf}$3`,
  );
  return { ...ids, shelf, html };
}

/** The ids of the `n`th made-up row; they never collide with saved ones. */
export function madeUpIds(n: number): { reviewId: string; bookId: string } {
  return {
    reviewId: String(7_000_000_000 + n),
    bookId: String(900_000_000 + n),
  };
}

/** The full list: 1450 rows with the real counts, page 1 the saved page. */
export function realList(): Row[] {
  const remaining = { ...REAL_COUNTS };
  for (const row of savedRows) remaining[row.shelf]--;
  const shelves = (Object.keys(remaining) as ExclusiveShelf[]).flatMap(
    (shelf) => Array<ExclusiveShelf>(remaining[shelf]).fill(shelf),
  );
  // interleave the shelves, so each page has a mix
  shelves.sort((a, b) => a.localeCompare(b));
  const mixed = shelves.map((_, i) => shelves[(i * 7) % shelves.length]!);
  return [
    ...savedRows,
    ...mixed.map((shelf, i) =>
      rowLike(savedRows[i % savedRows.length]!, madeUpIds(i), shelf),
    ),
  ];
}

/** Counts per exclusive shelf. */
export function countsOf(rows: readonly Row[]): Record<ExclusiveShelf, number> {
  const counts = Object.fromEntries(
    Object.keys(REAL_COUNTS).map((shelf) => [shelf, 0]),
  ) as Record<ExclusiveShelf, number>;
  for (const row of rows) counts[row.shelf]++;
  return counts;
}

/** A list page: the saved page's frame, with these rows and sidebar counts. */
export function renderPage(
  rows: readonly Row[],
  counts: Readonly<Record<ExclusiveShelf, number>> = countsOf(rows),
): string {
  let frame = head;
  for (const [shelf, count] of Object.entries(counts)) {
    frame = frame.replace(
      new RegExp(`(shelf=${shelf}">[^<]*&lrm;\\()\\d+(\\))`),
      `$1${count}$2`,
    );
  }
  return frame + rows.map((row) => row.html).join("\n") + tail;
}

/** Answers one request; `undefined` serves the list page as usual. */
export type Override = (
  page: number,
  /** This request's number, from 1, over the whole run. */
  request: number,
  signal: AbortSignal,
) => Response | undefined | Promise<Response | undefined>;

/** Answers one review page request; `undefined` serves the page as usual. */
export type ReviewOverride = (
  row: Row,
  signal: AbortSignal,
) => Response | undefined | Promise<Response | undefined>;

export interface FakeGoodreads {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The list page numbers requested, in order. */
  requests: number[];
  /** The review ids whose review page was requested, in order. */
  reviewRequests: string[];
  /** The headers of the first request. */
  firstHeaders?: Headers;
}

/**
 * Serves list pages from `list`, which a test may change between requests
 * (in `before`). The sidebar counts follow the list, unless `counts` is set.
 * Serves the review page of every book on the list.
 */
export function fakeGoodreads(
  list: Row[],
  options: {
    override?: Override;
    before?: (page: number, list: Row[]) => void;
    counts?: Record<ExclusiveShelf, number>;
    review?: ReviewOverride;
  } = {},
): FakeGoodreads {
  const html = (body: string) =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  const fake: FakeGoodreads = {
    requests: [],
    reviewRequests: [],
    async fetch(url, init) {
      const { pathname, searchParams } = new URL(url);
      const reviewId = /^\/review\/show\/(\d+)$/.exec(pathname)?.[1];
      if (reviewId !== undefined) {
        fake.reviewRequests.push(reviewId);
        const row = list.find((r) => r.reviewId === reviewId);
        if (row === undefined)
          return new Response("not found", { status: 404 });
        const answer = await options.review?.(
          row,
          init.signal ?? new AbortController().signal,
        );
        return answer ?? html(reviewPage(row));
      }
      if (pathname !== `/review/list/${FIXTURE_USER}`)
        return new Response("not found", { status: 404 });
      const page = Number(searchParams.get("page"));
      fake.requests.push(page);
      fake.firstHeaders ??= new Headers(init.headers);
      const answer = await options.override?.(
        page,
        fake.requests.length,
        init.signal ?? new AbortController().signal,
      );
      if (answer !== undefined) return answer;
      options.before?.(page, list);
      const rows = list.slice((page - 1) * 100, page * 100);
      return html(renderPage(rows, options.counts ?? countsOf(list)));
    },
  };
  return fake;
}
