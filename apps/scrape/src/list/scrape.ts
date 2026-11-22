import { ScrapeFailure } from "../failure.ts";
import type { Flow, Task } from "../flow/flow.ts";
import { EXCLUSIVE_SHELVES, type ExclusiveShelf } from "../goodreads.ts";
import { LIMITS } from "../limits.ts";
import type { PageSource } from "../pages/source.ts";
import { parseListPage, type ListPage } from "./parse.ts";

/** Rows on every list page but the last. */
export const PER_PAGE = 100;
/**
 * The most list pages a run fetches. It only guards against an endless
 * loop; reaching it fails the run.
 */
export const MAX_PAGES = LIMITS.maxListPages;

/**
 * A list page: all shelves, 100 per page, last updated first: the order of
 * the RSS feed, and of the reference copy (#31). An update on Goodreads
 * during a run shifts the pages, and the completeness checks fail that run.
 */
export function listPageUrl(user: string, page: number): string {
  return `https://www.goodreads.com/review/list/${user}?shelf=%23ALL%23&per_page=${PER_PAGE}&sort=date_updated&order=d&page=${page}`;
}

export interface FetchListPagesOptions {
  user: string;
  source: PageSource;
  flow: Flow;
}

/**
 * Fetches and parses every list page, through the flow controller. The
 * number of pages comes from page 1's sidebar: the exclusive shelves' total,
 * ÷ 100, rounded up (C1).
 */
export async function fetchListPages({
  user,
  source,
  flow,
}: FetchListPagesOptions): Promise<ListPage[]> {
  const task = (page: number): Task<ListPage> => {
    const url = listPageUrl(user, page);
    return {
      label: `list page ${page}`,
      cached: async () => (await source.has?.(url)) ?? false,
      async run(signal) {
        const { body } = await source.get(url, signal);
        return parseListPage(body, page, url);
      },
    };
  };

  const [first] = await flow.batch("list page 1", [task(1)]);
  const total = sum(first!.counts);
  if (total === 0) {
    throw new ScrapeFailure({
      step: "list-pages",
      mode: "empty-run",
      detail: "the sidebar counts no books on any exclusive shelf",
    });
  }
  const pages = Math.ceil(total / PER_PAGE);
  if (pages > MAX_PAGES) {
    throw new ScrapeFailure({
      step: "list-pages",
      mode: "page-limit",
      detail: `the sidebar counts ${total} books: ${pages} pages, over the ceiling of ${MAX_PAGES}`,
    });
  }
  if (pages === 1) return [first!];
  const rest = await flow.batch(
    `list pages 2-${pages}`,
    Array.from({ length: pages - 1 }, (_, i) => task(i + 2)),
  );
  return [first!, ...rest];
}

/** What the completeness checks found. */
export interface Completeness {
  counts: Record<ExclusiveShelf, number>;
  books: number;
  pages: number;
}

/**
 * Checks that the list pages hold every book exactly once (C2, C3):
 *
 * 1. every page's sidebar equals page 1's, its exclusive shelves and its
 *    tags, or the list changed during the run (`count-mismatch`);
 * 2. every page but the last has exactly 100 rows, the last 1 to 100
 *    (`page-size`);
 * 3. the unique books on each exclusive shelf, and with each tag, equal
 *    its sidebar count, and every tag on a row is in the sidebar
 *    (`count-mismatch`): a list that shifted during the run can hide a gap
 *    behind a duplicate, and keep the row count right;
 * 4. no book is listed twice (`duplicate-book`).
 */
export function checkCompleteness(pages: readonly ListPage[]): Completeness {
  const fail = (
    mode: "count-mismatch" | "page-size" | "duplicate-book",
    detail: string,
  ) => new ScrapeFailure({ step: "checks", mode, detail });
  const first = pages[0];
  if (first === undefined) throw fail("page-size", "no list pages");

  for (const page of pages) {
    // a tag is named apart: a shelf and a tag may share a name
    const sidebar = (p: ListPage): Record<string, number> => ({
      ...p.counts,
      ...Object.fromEntries(
        Object.entries(p.tagCounts).map(([tag, n]) => [`tag ${tag}`, n]),
      ),
    });
    const [now, then] = [sidebar(page), sidebar(first)];
    const changed = [
      ...new Set([...Object.keys(then), ...Object.keys(now)]),
    ].filter((name) => now[name] !== then[name]);
    const shown = (counts: Record<string, number>) =>
      changed.map((name) => `${name} ${counts[name] ?? "none"}`).join(", ");
    if (changed.length > 0) {
      throw fail(
        "count-mismatch",
        `the list changed during the run: page ${page.page}'s sidebar has ${shown(now)}, page 1's ${shown(then)}`,
      );
    }
  }

  for (const page of pages) {
    const last = page === pages[pages.length - 1];
    const rows = page.items.length;
    if (last ? rows < 1 || rows > PER_PAGE : rows !== PER_PAGE) {
      throw fail(
        "page-size",
        `list page ${page.page} has ${rows} rows; expected ${last ? `1 to ${PER_PAGE} (the last page)` : PER_PAGE}`,
      );
    }
  }

  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  const unique = Object.fromEntries(
    EXCLUSIVE_SHELVES.map((shelf) => [shelf, new Set<string>()]),
  ) as Record<ExclusiveShelf, Set<string>>;
  const tagged = new Map<string, Set<string>>(
    Object.keys(first.tagCounts).map((tag) => [tag, new Set()]),
  );
  for (const page of pages) {
    for (const item of page.items) {
      const before = seen.get(item.bookId);
      if (before !== undefined)
        duplicates.push(
          `book ${item.bookId} on pages ${before} and ${page.page}`,
        );
      else seen.set(item.bookId, page.page);
      unique[item.userShelf].add(item.bookId);
      for (const tag of item.userTags) {
        if (!tagged.has(tag)) tagged.set(tag, new Set());
        tagged.get(tag)!.add(item.bookId);
      }
    }
  }

  const counts = first.counts;
  const short = [
    ...EXCLUSIVE_SHELVES.filter(
      (shelf) => unique[shelf].size !== counts[shelf],
    ).map(
      (shelf) => `${shelf} ${unique[shelf].size} (sidebar ${counts[shelf]})`,
    ),
    ...[...tagged]
      .filter(([tag, books]) => books.size !== first.tagCounts[tag])
      .map(([tag, books]) =>
        tag in first.tagCounts
          ? `${tag} ${books.size} (sidebar ${first.tagCounts[tag]})`
          : `${tag} ${books.size} (not in the sidebar)`,
      ),
  ];
  if (short.length > 0) {
    throw fail(
      "count-mismatch",
      `unique books per shelf or tag differ from the sidebar: ${short.join(", ")}` +
        (duplicates.length > 0
          ? `; listed twice: ${duplicates.join(", ")}`
          : ""),
    );
  }
  if (duplicates.length > 0)
    throw fail("duplicate-book", `listed twice: ${duplicates.join(", ")}`);

  return { counts, books: seen.size, pages: pages.length };
}

/** "counts match the sidebar: to-read 448, …; 1450 books on 15 pages" */
export function formatCompleteness({
  counts,
  books,
  pages,
}: Completeness): string {
  const shelves = EXCLUSIVE_SHELVES.map(
    (shelf) => `${shelf} ${counts[shelf]}`,
  ).join(", ");
  return `counts match the sidebar: ${shelves}; ${books} books on ${pages} pages`;
}

function sum(counts: Record<ExclusiveShelf, number>): number {
  return EXCLUSIVE_SHELVES.reduce((total, shelf) => total + counts[shelf], 0);
}
