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
  /** The review date, `YYYY-MM-DD`. */
  reviewPageDay: string;
  /** The review, as HTML, trimmed; `""` when there is none. */
  userReview: string;
}

const Shelf = z.enum(EXCLUSIVE_SHELVES);
const Day = z.iso.date();

/**
 * Parses a signed-in review page (`review/show/<reviewId>`): the exclusive
 * shelf from the heading, and the reading timeline, raw. Each value is
 * validated with zod as it is parsed (S1).
 *
 * A timeline row is "date – event", or just "event" when it has no date.
 * The owner-only "Add a date" link of an undated row is left out. The
 * review date comes from the review's header, and the review is its HTML
 * exactly as in the page source (`<br />`), trimmed.
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
  // source locations: the review is cut from the page source as it is
  const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
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

  const dateTitle = $(".dtreviewed .value-title[title]");
  if (dateTitle.length !== 1)
    throw fail("layout-change", "no review date in the review header");
  const day = dateTitle.attr("title");
  const reviewPageDay = Day.safeParse(day);
  if (!reviewPageDay.success)
    throw fail(
      "parse-failure",
      `review date: ${describeIssues(reviewPageDay.error, { day })}`,
    );

  const body = $("[itemprop=reviewBody]");
  if (body.length > 1) throw fail("layout-change", "more than one review");
  const location = body[0]?.sourceCodeLocation;
  if (body.length === 1 && (!location?.startTag || !location.endTag))
    throw fail("layout-change", "the review has no source location");
  const userReview =
    location?.startTag && location.endTag
      ? html
          .slice(location.startTag.endOffset, location.endTag.startOffset)
          .trim()
      : "";

  return {
    exclusiveShelf: exclusiveShelf.data,
    timeline,
    reviewPageDay: reviewPageDay.data,
    userReview,
  };
}
