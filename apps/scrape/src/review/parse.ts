import * as cheerio from "cheerio";
import { z } from "zod";

import { ScrapeFailure } from "../failure.ts";
import {
  EXCLUSIVE_SHELVES,
  TimelineRow,
  type ExclusiveShelf,
} from "../goodreads.ts";
import { describeIssues } from "../list/parse.ts";

/** One review page, parsed and validated. */
export interface ReviewPage {
  /** From the heading's link to the shelf: "… ?shelf=read". */
  exclusiveShelf: ExclusiveShelf;
  /** The reading timeline, in page order, as shown. */
  timeline: TimelineRow[];
}

const Shelf = z.enum(EXCLUSIVE_SHELVES);

/**
 * Parses a signed-in review page (`review/show/<reviewId>`): the exclusive
 * shelf from the heading, and the reading timeline, raw. Each value is
 * validated with zod as it is parsed (S1).
 *
 * A timeline row is "date – event", or just "event" when it has no date.
 * The owner-only "Add a date" link of an undated row is left out.
 *
 * Throws a `ScrapeFailure`: `layout-change` when a part of the page is
 * missing (S3), `parse-failure` when a value fails its schema. Both name the
 * review page, and the timeline row if there is one.
 */
export function parseReviewPage(
  html: string,
  reviewId: string,
  url: string,
): ReviewPage {
  const $ = cheerio.load(html);
  const where = `review page ${reviewId}`;
  const fail = (mode: "layout-change" | "parse-failure", detail: string) =>
    new ScrapeFailure({
      step: "review-pages",
      mode,
      detail: `${where}: ${detail}`,
      url,
    });

  const heading = $('h1 a[href*="shelf="]');
  if (heading.length !== 1)
    throw fail("layout-change", "no shelf link in the heading");
  const shelf = new URL(
    heading.attr("href")!,
    "https://www.goodreads.com",
  ).searchParams.get("shelf");
  const exclusiveShelf = Shelf.safeParse(shelf);
  if (!exclusiveShelf.success)
    throw fail(
      "parse-failure",
      `heading shelf: ${describeIssues(exclusiveShelf.error, { shelf })}`,
    );

  const box = $(".readingTimeline");
  if (box.length !== 1) throw fail("layout-change", "no reading timeline");
  const timeline = box
    .find(".readingTimeline__row")
    .toArray()
    .map((row, index) => {
      const text = $(row).find(".readingTimeline__text");
      if (text.length !== 1)
        throw fail("layout-change", `timeline row ${index + 1}: no text`);
      const shown = text
        .clone()
        .find("a.add_date_link")
        .remove()
        .end()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      // the date and the event are split by the first en dash (&ndash;)
      const dash = shown.indexOf("–");
      const raw =
        dash < 0
          ? { dateText: "", event: shown }
          : {
              dateText: shown.slice(0, dash).trim(),
              event: shown.slice(dash + 1).trim(),
            };
      const parsed = TimelineRow.safeParse(raw);
      if (!parsed.success)
        throw fail(
          "parse-failure",
          `timeline row ${index + 1}: ${describeIssues(parsed.error, raw)}`,
        );
      return parsed.data;
    });

  return { exclusiveShelf: exclusiveShelf.data, timeline };
}
