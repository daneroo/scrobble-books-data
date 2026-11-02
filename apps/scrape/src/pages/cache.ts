/**
 * The raw pages of a run, saved under one name per URL; `--cached` reads
 * them back instead of fetching them again.
 */
import { join } from "node:path";

import { ScrapeFailure, type Step } from "../failure.ts";
import { acceptPage, type PageSource } from "./source.ts";

/**
 * The file a page is saved under: `list-p01.html` (by its `page`
 * parameter), `review-<reviewId>.html`.
 */
export function pageFileName(url: string): string {
  const { pathname, searchParams } = new URL(url);
  if (pathname.startsWith("/review/list/")) {
    const page = searchParams.get("page") ?? "1";
    return `list-p${page.padStart(2, "0")}.html`;
  }
  const review = /^\/review\/show\/(\d+)$/.exec(pathname);
  if (review !== null) return `review-${review[1]}.html`;
  throw new Error(`no saved-page name for ${pathname}`);
}

/**
 * Saves every page `source` returns into `dir`, and the body of a rejected
 * one too: it is the one most worth seeing (X3).
 */
export function pageSaver(dir: string): {
  wrap(source: PageSource): PageSource;
  /** Once every write has finished. */
  flushed(): Promise<void>;
} {
  const writes: Promise<unknown>[] = [];
  const save = (url: string, body: string) =>
    writes.push(Bun.write(join(dir, pageFileName(url)), body));
  return {
    wrap: (source) => ({
      async get(url, signal) {
        try {
          const page = await source.get(url, signal);
          save(url, page.body);
          return page;
        } catch (error) {
          if (error instanceof ScrapeFailure && error.body !== undefined)
            save(url, error.body);
          throw error;
        }
      },
    }),
    flushed: async () => {
      await Promise.all(writes);
    },
  };
}

/**
 * A read-through cache (`--cached`): a page saved in `dir` is read from
 * there, any other is got from `source`. A saved page is checked as a
 * fetched 200 is, so a saved rejected page (a sign-in redirect, a 404 body)
 * fails the same way. No expiry: a run without `--cached` refreshes it all.
 */
export function readThrough(
  source: PageSource,
  dir: string,
  step: Step,
): PageSource {
  return {
    async get(url, signal) {
      const file = Bun.file(join(dir, pageFileName(url)));
      if (!(await file.exists())) return source.get(url, signal);
      const body = await file.text();
      return acceptPage(
        { url, status: 200, headers: new Headers(), body },
        step,
      );
    },
  };
}
