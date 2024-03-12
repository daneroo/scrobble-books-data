import * as cheerio from "cheerio";

import * as browser from "../browser/module";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { removeLast } from "../removeLast";
import type {
  AuthState,
  FetchOptions,
  ReadingProgress,
  ReviewItem,
  ScrapingContext,
} from "../types";
import { itemURL } from "../urls";

/**
 * Creates a scraping context based on the provided fetch options for the html(cheerio) engine.
 * @param fetchOptions - The options for fetching the review items.
 * @returns A promise that resolves to a scraping context.
 */
export async function createContext(
  fetchOptions: FetchOptions
): Promise<ScrapingContext> {
  // Cheerio context setup if needed; e.g., initializing with global options or cookies
  const authState: AuthState = await traceLogin();

  async function traceLogin(): Promise<AuthState> {
    // Optional: perform login or other setup steps here, depending on fetchOptions
    if (fetchOptions.authenticate) {
      const scrapingContext: ScrapingContext = await browser.createContext({
        ...fetchOptions,
        engine: "browser",
      });
      console.log(`- Created scraping context for browser`);
      const authState = scrapingContext.getAuthState();
      console.log(`- Authenticated: ${authState.authenticated}`);
      await scrapingContext.cleanup();
      return authState;
    } else {
      return { authenticated: false, cookie: "" };
    }
  }

  return {
    getAuthState: () => authState,
    cleanup: async () => {
      // Scraping context cleanup (no actions necessary for html/Cheerio context)
    },
    fetchReviewItemsInPage: async (url: string) => {
      return fetchReviewItemsInPage(url, authState);
    },
    fetchReadingProgress: async (reviewId: string) => {
      return fetchReadingProgress(reviewId, authState);
    },
  };
}

/**
 * Fetches review items from a given Goodreads reviews page.
 * helper for implementing the ScrapingContext.fetchReviewItemsInPage method
 * @param page - Playwright Page object for browser automation.
 * @param url - The URL to fetch the review items from.
 * @returns A promise that resolves to an array of ReviewItem objects.
 */
async function fetchReviewItemsInPage(
  url: string,
  authState: AuthState
): Promise<Array<ReviewItem>> {
  const timeout = 5000;
  const fetchOpts = authState.authenticated
    ? {
        headers: {
          cookie: authState.cookie,
        },
      }
    : {};
  if (authState.authenticated && !authState.cookie) {
    throw new Error("Authenticated but missing cookie");
  }

  const response = await fetchWithTimeout(url, fetchOpts, timeout);

  if (!response.ok) {
    console.debug(`- response:${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch page: ${url}`);
  }
  const html = await response.text();

  // sanity check for authState
  if (authState.authenticated) {
    // if (window.ue && window.ue.tag) { window.ue.tag('review:list:signed_in', ue.main_scope);window.ue.tag('review:list:signed_in:desktop', ue.main_scope); }
    const isLoggedIn = html.includes(":signed_in'");
    if (!isLoggedIn) {
      // await fs.writeFile("auth-invalid.html", html);
      throw new Error("- Authentication validation failed");
    }
  }

  // const pageNumber = new URL(url).searchParams.get("page");
  // const filename = `./data/review-list-html-auth-p${pageNumber}.html`;
  // console.log(`- browser:Saving: ${filename}`);
  // await fs.writeFile(filename, html);

  const $ = cheerio.load(html);
  const items = $("#booksBody") // this is a tbody
    .find("tr")
    .map((_, row) => {
      // Extract the ID from the row's attributes (not $row)
      // this gets typed wrong, it should be string|undefined, but TS thinks it's string
      // const id = (row as cheerio.TagElement).attribs.id as string | undefined;
      // but I will let it slide and validate the whole output later
      //  Casting to TagElement is safe because <tr>, and necessary to access the attribs property
      const id = (row as cheerio.TagElement).attribs.id;
      const reviewId = id.split("_")?.[1] ?? "";

      // Extract title, author, and readCount using Cheerio selectors

      // const title = $(row).find(".field.title a").text().trim();
      // title includes the series, so we need to remove it
      const titleWithSeries = $(row).find(".field.title a").text().trim();
      const series = $(row).find(".field.title a span").text().trim();
      const title = removeLast(titleWithSeries, series).trim();
      const author = $(row).find(".field.author a").text().trim();
      const readCount = $(row).find(".field.read_count .value").text().trim();

      // TODO(daneroo): detect shelves (not present if signed out)
      // TODO(daneroo): fix if authenticated, the extraction is wrong
      // "shelves": [      vs "shelves": [
      //   "to-read"            "shelves\n        to-read[edit]"
      // ],                   ],
      //
      // the shelves in the static (unauthenticated) html page is broken
      // -  It contains the content of the rating column: Goodreads bug!
      const shelves = authState.authenticated
        ? ($(row)
            .find(".field.shelves")
            .map((idx, el) => $(el).text().trim())
            .get() as string[])
        : []; // no shelves if not authenticated

      // For dateStartedValues and dateReadValues, use Cheerio to find and map the
      const dateStartedValues = $(row)
        .find(".field.date_started .date_started_value")
        .map((idx, el) => $(el).text().trim())
        .get() as string[];

      const dateReadValues = $(row)
        .find(".field.date_read .date_read_value")
        .map((idx, el) => $(el).text().trim())
        .get() as string[];

      // Construct and log the object with the extracted data
      const item = {
        id,
        reviewId,
        title,
        series,
        author,
        readCount,
        shelves,
        dateStartedValues,
        dateReadValues,
      } as ReviewItem;
      // console.log(`- Item: ${JSON.stringify(item)}`);
      return item;
    })
    .get() as ReviewItem[]; // convert back to a regular

  // TODO(daneroo): need a runtime validation of items: ReviewItem[]

  return items;
}

async function fetchReadingProgress(
  reviewId: string,
  authState: AuthState
): Promise<ReadingProgress> {
  const url = itemURL(reviewId);
  const timeout = 2000; // tested with 2000ms to be optimal
  const response = await fetchWithTimeout(url, {}, timeout);
  if (!response.ok) {
    console.debug(`- response:${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch page: ${url}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract shelves
  const shelves = $("span.userReview ~ a.actionLinkLite")
    .map((_, el) => {
      return $(el).text().trim();
    })
    .get(); // .get() converts Cheerio object to an array

  // Extract timeline
  const timeline = $(".readingTimeline .readingTimeline__row")
    .map((_, row) => {
      const fullText = $(row)
        .find(".readingTimeline__text")
        .text()
        .replace(/\n/g, " ")
        .trim();
      const [date, event] = fullText.split("–").map((part) => part.trim());
      return { date, event };
    })
    .get(); // Convert Cheerio object to an array

  const readingProgress: ReadingProgress = {
    reviewId,
    shelves,
    timeline,
  };

  return readingProgress;
}
