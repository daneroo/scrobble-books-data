import { ScrapeFailure, type Failure, type Step } from "./failure.ts";
import { FlowFailure, type Flow } from "./flow/flow.ts";
import {
  checkCompleteness,
  fetchListPages,
  formatCompleteness,
} from "./list/scrape.ts";
import { pageSaver, readThrough } from "./pages/cache.ts";
import { PageTemporaryError, type PageSource } from "./pages/source.ts";
import { fetchBookPages, withBookFields } from "./book/scrape.ts";
import { fetchReviewPages, withProgress } from "./review/scrape.ts";
import { resetRunFiles, runFiles, writeOutputs } from "./outputs.ts";
import { IsoPublished, type Item } from "./goodreads.ts";
import type {
  Outcome,
  PublishedAsShown,
  ReadCountMismatch,
  RepeatedWork,
  ShelvedDayMismatch,
} from "./report.ts";
import { dayStart, shelvedDates } from "./review/timeline.ts";

export interface RunOptions {
  user: string;
  /** One per page type: each has its own timeout (T2) and failure step. */
  sources: { list: PageSource; review: PageSource; book: PageSource };
  /**
   * A restart: a page an earlier pass of this run saved in the data
   * directory is read from there, not fetched; the others are fetched and
   * saved. Otherwise (the first pass) the saved pages are cleared first, and
   * every page is fetched and saved.
   */
  reusePages?: boolean;
  flow: Flow;
  /** The gitignored data directory: raw pages, staged output. */
  dataDir: string;
  /** Where `goodreads.json` is published once every check passes. */
  publishPath: string;
  cueSchema?: string;
  /**
   * The pass deadline (T3), also given to the flow controller: once it
   * aborts, nothing more is written or published.
   */
  signal?: AbortSignal;
  /** Every log line; the caller redacts them (X4). */
  log: (line: string) => void;
}

/**
 * One pass of the scrape, after the session is read: fetch and parse every
 * list page, check completeness, fetch and parse every book's review page,
 * check its shelf, fetch every book page, write `goodreads.json`, run CUE,
 * then publish. Fail-closed: any failure is returned named, and nothing is
 * published. A work on the list more than once, a `userAddedAt` off its
 * timeline's "Shelved" day, a `userReadCount` off its list row's "# times
 * read", a book on "read" with no finish, or a `bookPublished` kept as
 * shown, is no failure: it is returned, for a warning.
 */
export async function runScrape(options: RunOptions): Promise<Outcome> {
  const { user, flow, dataDir, publishPath, cueSchema, signal, log } = options;
  const { reusePages = false } = options;
  const pagesDir = runFiles(dataDir).pages;
  const saver = pageSaver(pagesDir);
  const source = (fetching: PageSource, step: Step) =>
    reusePages
      ? readThrough(saver.wrap(fetching), pagesDir, step)
      : saver.wrap(fetching);
  const sources = {
    list: source(options.sources.list, "list-pages"),
    review: source(options.sources.review, "review-pages"),
    book: source(options.sources.book, "book-pages"),
  };
  let step: Step = "list-pages";
  try {
    await resetRunFiles(dataDir, { keepPages: reusePages });
    if (reusePages) log(`restart: reading the pages saved in ${pagesDir}`);
    const pages = await fetchListPages({
      user,
      source: sources.list,
      flow,
    });

    step = "checks";
    const completeness = checkCompleteness(pages);
    log(formatCompleteness(completeness));
    const listItems = pages.flatMap((page) => page.items);

    step = "review-pages";
    const reviews = await fetchReviewPages({
      items: listItems,
      source: sources.review,
      flow,
    });

    step = "checks";
    const reviewed = withProgress(listItems, reviews);
    log(`review page shelves match the list: ${reviewed.length} books`);

    step = "book-pages";
    const books = await fetchBookPages({
      items: listItems,
      source: sources.book,
      flow,
    });
    const items = withBookFields(reviewed, books);

    step = "outputs";
    signal?.throwIfAborted();
    await writeOutputs({
      goodreads: items,
      dataDir,
      publishPath,
      cueSchema,
      signal,
    });
    return {
      ok: true,
      books: completeness.books,
      pages: completeness.pages,
      reviewPages: reviews.length,
      bookPages: books.length,
      published: publishPath,
      repeatedWorks: repeatedWorks(items),
      shelvedDayMismatches: shelvedDayMismatches(items),
      readCountMismatches: readCountMismatches(
        items,
        pages.flatMap((page) => page.timesRead),
      ),
      readWithoutFinish: items
        .filter((item) => item.userExclusiveShelf === "read")
        .filter((item) => item.userReadCount === 0)
        .map((item) => item.id),
      publishedAsShown: publishedAsShown(items),
    };
  } catch (error) {
    const failure = failureOf(error, step);
    // the deadline names the step it cut short
    if (failure.mode === "run-timeout") failure.step = step;
    return { ok: false, failure };
  } finally {
    // kept until the end of the run, for a restart to read
    await saver.flushed();
  }
}

/** Each work with more than one entry, in list order, with their `id`s. */
function repeatedWorks(items: readonly Item[]): RepeatedWork[] {
  const byWork = Map.groupBy(items, (item) => item.workId);
  return [...byWork]
    .filter(([, editions]) => editions.length > 1)
    .map(([workId, editions]) => ({
      workId,
      ids: editions.map((item) => item.id),
    }));
}

/**
 * Each entry whose `userAddedAt` is not the day of its timeline's one
 * "Shelved" row (its own edition's), in list order; also one with no such
 * row, or more than one.
 */
function shelvedDayMismatches(items: readonly Item[]): ShelvedDayMismatch[] {
  return items.flatMap(({ id, userAddedAt, timeline }) => {
    const dates = shelvedDates(timeline);
    const agrees = dates.length === 1 && dayStart(dates[0]!) === userAddedAt;
    return agrees ? [] : [{ id, userAddedAt, shelvedDates: dates }];
  });
}

/**
 * Each entry whose list row's "# times read" is not its `userReadCount`,
 * plus 1 on "currently-reading" (Goodreads counts the read in progress), in
 * list order. `timesRead` is in the order of `items`.
 */
function readCountMismatches(
  items: readonly Item[],
  timesRead: readonly number[],
): ReadCountMismatch[] {
  return items.flatMap(({ id, userExclusiveShelf, userReadCount }, i) => {
    const inProgress = userExclusiveShelf === "currently-reading" ? 1 : 0;
    const listed = timesRead[i]!;
    return listed === userReadCount + inProgress
      ? []
      : [{ id, userExclusiveShelf, userReadCount, timesRead: listed }];
  });
}

/** Each entry whose `bookPublished` is kept as shown, in list order. */
function publishedAsShown(items: readonly Item[]): PublishedAsShown[] {
  return items
    .filter((item) => !IsoPublished.safeParse(item.bookPublished).success)
    .map(({ id, bookPublished }) => ({ id, bookPublished }));
}

/** Names any error the run can end with. */
export function failureOf(error: unknown, step: Step): Failure {
  if (error instanceof ScrapeFailure) return error.failure;
  if (error instanceof PageTemporaryError || error instanceof FlowFailure)
    return { step, mode: error.mode, detail: error.message };
  const message = error instanceof Error ? error.message : String(error);
  return { step, mode: "error", detail: message.split("\n")[0] ?? "" };
}
