/**
 * For tests: a fake Goodreads that serves list pages built from the saved,
 * scrubbed list page (`fixtures/list-page-1.html`), with no network.
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

export interface FakeGoodreads {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The page numbers requested, in order. */
  requests: number[];
  /** The headers of the first request. */
  firstHeaders?: Headers;
}

/**
 * Serves list pages from `list`, which a test may change between requests
 * (in `before`). The sidebar counts follow the list, unless `counts` is set.
 */
export function fakeGoodreads(
  list: Row[],
  options: {
    override?: Override;
    before?: (page: number, list: Row[]) => void;
    counts?: Record<ExclusiveShelf, number>;
  } = {},
): FakeGoodreads {
  const fake: FakeGoodreads = {
    requests: [],
    async fetch(url, init) {
      const { pathname, searchParams } = new URL(url);
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
      return new Response(renderPage(rows, options.counts ?? countsOf(list)), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  };
  return fake;
}
