import { z } from "zod";

import { ScrapeFailure } from "../failure.ts";
import { describeIssues } from "../list/parse.ts";

/** One book page, parsed and validated. */
export interface BookPage {
  /** The description, as HTML (`<br />`, `<i>`), as shown, trimmed (S4). */
  bookDescription: string;
  /** The primary contributor's name, as shown, spacing kept. */
  authorName: string;
}

const Fields = z.strictObject({
  bookDescription: z.string(),
  authorName: z.string().min(1),
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
 * - `bookDescription`: the `Book`'s `description`, trimmed, as the
 *   reference is (S4, #31);
 * - `authorName`: the `name` of the `Contributor` its
 *   `primaryContributorEdge` points to.
 *
 * Throws a `ScrapeFailure`: `layout-change` when the data, the book or the
 * contributor is missing, `parse-failure` when a value fails its schema.
 * Both name the book page.
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

  const raw = {
    bookDescription:
      typeof book.description === "string"
        ? book.description.trim()
        : book.description,
    authorName: contributor.name,
  };
  const parsed = Fields.safeParse(raw);
  if (!parsed.success)
    throw fail("parse-failure", describeIssues(parsed.error, raw));
  return parsed.data;
}
