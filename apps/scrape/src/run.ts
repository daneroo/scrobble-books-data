import { join } from "node:path";

import { ScrapeFailure, type Failure, type Step } from "./failure.ts";
import { FlowFailure, type Flow } from "./flow/flow.ts";
import {
  checkCompleteness,
  fetchListPages,
  formatCompleteness,
} from "./list/scrape.ts";
import { PageTemporaryError, type PageSource } from "./pages/source.ts";
import { fetchReviewPages, withProgress } from "./review/scrape.ts";
import {
  resetRunFiles,
  runFiles,
  segmentName,
  writeOutputs,
} from "./outputs.ts";
import type { Outcome } from "./report.ts";

export interface RunOptions {
  user: string;
  /** One per page type: each has its own timeout (T2) and failure step. */
  sources: { list: PageSource; review: PageSource };
  flow: Flow;
  /** The gitignored data directory: segments, raw pages, staged output. */
  dataDir: string;
  /** Where `goodreads.json` is published once every check passes. */
  publishPath: string;
  cueSchema?: string;
  /**
   * The run deadline (T3), also given to the flow controller: once it
   * aborts, nothing more is written or published.
   */
  signal?: AbortSignal;
  /** Every log line; the caller redacts them (X4). */
  log: (line: string) => void;
}

/**
 * The scrape after login: fetch and parse every list page, check
 * completeness, fetch and parse every book's review page, check its shelf,
 * write the segments and `goodreads.json`, run CUE, then publish.
 * Fail-closed: any failure is returned named, and nothing is published.
 */
export async function runScrape(options: RunOptions): Promise<Outcome> {
  const { user, sources, flow, dataDir, publishPath, cueSchema, signal, log } =
    options;
  const bodies = new Map<number, string>();
  // review pages are written as they arrive, not held in memory
  const reviewWrites: Promise<unknown>[] = [];
  let step: Step = "list-pages";
  try {
    await resetRunFiles(dataDir);
    const pages = await fetchListPages({
      user,
      source: sources.list,
      flow,
      onBody: (page, body) => bodies.set(page, body),
    });

    step = "checks";
    const completeness = checkCompleteness(pages);
    log(formatCompleteness(completeness));

    step = "review-pages";
    const listItems = pages.flatMap((page) => page.items);
    const reviews = await fetchReviewPages({
      items: listItems,
      source: sources.review,
      flow,
      onBody: (reviewId, body) =>
        reviewWrites.push(
          Bun.write(
            join(runFiles(dataDir).pages, `review-${reviewId}.html`),
            body,
          ),
        ),
    });

    step = "checks";
    const items = withProgress(listItems, reviews);
    log(`review page shelves match the list: ${items.length} books`);

    step = "outputs";
    signal?.throwIfAborted();
    const goodreads = { userFullName: pages[0]!.userFullName, items };
    let next = 0;
    const segments = pages.map((page) => ({
      page: page.page,
      items: items.slice(next, (next += page.items.length)),
    }));
    await writeOutputs({
      goodreads,
      segments,
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
      published: publishPath,
    };
  } catch (error) {
    const failure = failureOf(error, step);
    // the deadline names the step it cut short
    if (failure.mode === "run-timeout") failure.step = step;
    return { ok: false, failure };
  } finally {
    // kept on success and on failure, for debugging (X3)
    const dir = runFiles(dataDir).pages;
    await Promise.all([
      ...reviewWrites,
      ...[...bodies].map(([page, body]) =>
        Bun.write(join(dir, segmentName(page, "html")), body),
      ),
    ]);
  }
}

/** Names any error the run can end with. */
export function failureOf(error: unknown, step: Step): Failure {
  if (error instanceof ScrapeFailure) return error.failure;
  if (error instanceof PageTemporaryError || error instanceof FlowFailure)
    return { step, mode: error.mode, detail: error.message };
  const message = error instanceof Error ? error.message : String(error);
  return { step, mode: "error", detail: message.split("\n")[0] ?? "" };
}
