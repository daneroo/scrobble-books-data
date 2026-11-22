import { z } from "zod";

import { ScrapeFailure } from "../failure.ts";
import { describeIssues } from "../list/parse.ts";

/** One book page, parsed and validated. */
export interface BookPage {
  /** The work, all editions of the book: its Goodreads work id, digits. */
  workId: string;
  /** The description, as HTML (`<br />`, `<i>`), as shown, trimmed (S4). */
  bookDescription: string;
  /** The primary contributor's name, as shown, spacing kept. */
  authorName: string;
  /**
   * The last update of the user's review record, ISO 8601 UTC; absent when
   * the book has no rating or review.
   */
  reviewUpdatedAt?: string;
}

const Fields = z.strictObject({
  /** A positive integer, as the page has it. */
  workId: z.number().int().positive(),
  bookDescription: z.string(),
  authorName: z.string().min(1),
  /** Milliseconds since the epoch, as the page has it. */
  reviewUpdatedAt: z.number().int().positive().optional(),
});

/** The page data, down to the Apollo cache: entries by key. */
const PageData = z.object({
  props: z.object({
    pageProps: z.object({
      apolloState: z.record(z.string(), z.record(z.string(), z.unknown())),
    }),
  }),
});

const NEXT_DATA =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

/**
 * Parses a signed-in book page (`book/show/<bookId>-<slug>`). Its data is
 * not in the markup: it is the page's embedded JSON (`__NEXT_DATA__`), whose
 * `apolloState` holds the `Book` with this `legacyId` and its contributors
 * (#28):
 *
 * - `workId`: the `legacyId` of the `Work` the `Book`'s `work` points to
 *   (#71);
 * - `bookDescription`: the `Book`'s `description`, trimmed, as the
 *   reference is (S4, #31);
 * - `authorName`: the `name` of the `Contributor` its
 *   `primaryContributorEdge` points to;
 * - `reviewUpdatedAt`: the `updatedAt` of the user's `Review`, through the
 *   `Book`'s `viewerShelving` and that `Shelving`'s `review` (#39); the
 *   `Shelving` has no `review` when the book has no rating or review.
 *
 * Throws a `ScrapeFailure`: `layout-change` when the data, the book, its
 * work or the contributor is missing, `parse-failure` when a value fails
 * its schema. Both name the book page.
 */
export function parseBookPage(
  html: string,
  bookId: string,
  url: string,
): BookPage {
  const fail = (mode: "layout-change" | "parse-failure", detail: string) =>
    new ScrapeFailure({
      step: "book-pages",
      mode,
      detail: `book page ${bookId}: ${detail}`,
      url,
    });

  const json = NEXT_DATA.exec(html)?.[1];
  if (json === undefined) throw fail("layout-change", "no page data");
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw fail("layout-change", "the page data is not JSON");
  }
  const page = PageData.safeParse(data);
  if (!page.success)
    throw fail("layout-change", "no apolloState in the page data");
  const state = page.data.props.pageProps.apolloState;

  const books = Object.values(state).filter(
    (entry) => entry.__typename === "Book" && entry.legacyId === Number(bookId),
  );
  if (books.length !== 1)
    throw fail("layout-change", `${books.length} books with this id`);
  const book = books[0]!;
  const edge = book.primaryContributorEdge as
    { node?: { __ref?: string } } | undefined;
  const ref = edge?.node?.__ref;
  const contributor = ref === undefined ? undefined : state[ref];
  if (contributor === undefined)
    throw fail("layout-change", "no primary contributor");
  const work = state[refOf(book.work) ?? ""];
  if (work === undefined) throw fail("layout-change", "no work");

  const shelving = state[refOf(book.viewerShelving) ?? ""];
  const review = state[refOf(shelving?.review) ?? ""];

  const raw = {
    workId: work.legacyId,
    bookDescription:
      typeof book.description === "string"
        ? book.description.trim()
        : book.description,
    authorName: contributor.name,
    reviewUpdatedAt: review?.updatedAt,
  };
  const parsed = Fields.safeParse(raw);
  if (!parsed.success)
    throw fail("parse-failure", describeIssues(parsed.error, raw));
  const { workId, reviewUpdatedAt, ...rest } = parsed.data;
  const fields = { workId: String(workId), ...rest };
  return reviewUpdatedAt === undefined
    ? fields
    : { ...fields, reviewUpdatedAt: new Date(reviewUpdatedAt).toISOString() };
}

/** The key an Apollo reference (`{ __ref }`) points to, if it is one. */
function refOf(value: unknown): string | undefined {
  const ref = (value as { __ref?: unknown } | null | undefined)?.__ref;
  return typeof ref === "string" ? ref : undefined;
}
