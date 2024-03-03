import { chromium } from "playwright";
import { shelfIterator } from "./goodreads/urls";

// Importing types
import type { Browser, Page, BrowserType, LaunchOptions } from "playwright";
import type { Shelf, ListIteratorParams, ListParams } from "./goodreads/urls";

interface Credentials {
  GOODREADS_USERNAME: string;
  GOODREADS_PASSWORD: string;
  GOODREADS_USER: string;
  GOODREADS_KEY: string;
}

interface BrowserConfig {
  browserType: BrowserType<Browser>;
  launchOptions: LaunchOptions;
}

interface ReviewURLParams {
  page: number;
  per_page: number;
  sort: string; // "date_updated" or "date_added"
  order: string; // "a" or "d"
  utf8: string; // "✓"
  shelf: string; // #ALL# or "currently-reading", "on-deck", "read", "to-read"
}

interface ReviewItem {
  id: string;
  title: string;
  author: string;
  readCount: string;
  dateStartedValues: string[];
  dateReadValues: string[];
}

// Global object,driven byy yargs later
const browserConfig: BrowserConfig = {
  browserType: chromium,
  launchOptions: {
    headless: false,
  },
};

async function main() {
  try {
    const credentials = getCredentials();
    console.log("- Got credentials, or would have exited early.");

    const { page, browser } = await getNewPlaywrightPage(browserConfig);
    console.log("- Got page and browser");

    const loggedIn = await login(credentials, page);
    console.log(`- Login: ${loggedIn}`);

    // if not logged in, we get 20 items per page, and cannot override it
    // but 100 is faster if we are logged in
    const per_page = loggedIn ? 100 : 20;

    // browsing by shelf
    const shelves: Shelf[] = ["#ALL#"]; // "currently-reading", "on-deck", "read", "to-read",
    for (const shelf of shelves) {
      console.log(`\n## Scanning shelf:${shelf}`);
      const params = reviewURLParamsForShelf(shelf);
      const listParams = { shelf, per_page };
      const data = await reviewPageIterator(page, credentials, listParams);
      console.log(`- shelf:${shelf} items:${data.length}`);
    }

    // Now for a specific book, go to the review page (from the id=review_4789085379 above)
    // const ids = ["4789085379", "3888950315"]; // Add your desired IDs here
    // for (const id of ids) {
    //   const readingProgress = await getReadingProgress(page, id);
    //   await page.waitForTimeout(1000);
    //   console.log(id, readingProgress);
    // }

    // // Add a wait for 5 seconds
    // await page.waitForTimeout(1000);

    await browser.close();
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.message);
    } else {
      console.error("An unknown error occurred", e);
    }
  }
}

// Iterates over review pages and retrieves data from each page.
async function reviewPageIterator(
  page: Page,
  credentials: Credentials,
  listParams: ListIteratorParams
): Promise<Array<Object>> {
  const maxPages = 100;
  const allItems: ReviewItem[] = [];
  // use shelfIterator to get the URLs
  for await (const { url, urlParams } of shelfIterator(
    credentials.GOODREADS_USER,
    listParams
  )) {
    const start = +new Date();
    const maxRetries = 5;
    const items = await getItemsFromReviewURLWithRetry(page, url, maxRetries);
    allItems.push(...items);
    logProgress(start, urlParams, items, url);
    if (shouldTerminate(items, urlParams, maxPages)) {
      break;
    }

    function logProgress(
      start: number,
      urlParams: ListParams,
      items: ReviewItem[],
      url: string
    ) {
      const elapsed = +new Date() - start;
      console.log(
        `- page:${urlParams.page} in ${elapsed}ms items:${
          items.length
        } ${JSON.stringify(urlParams)}`
      );
      console.debug(`  - url:${url}`);
    }
    function shouldTerminate(
      data: ReviewItem[],
      urlParams: ListParams,
      maxPages: number
    ) {
      if (data.length === 0) {
        console.info(`- break: no items:${data.length}`);
        return true;
      }
      if (data.length < urlParams.per_page) {
        console.info(
          `- break: ${data.length} items < per_page:${urlParams.per_page} items, breaking`
        );
        return true;
      }
      if (urlParams.page >= maxPages) {
        console.warn(
          `- break page:${urlParams.page} of max:${maxPages} exceeded, breaking out of page loop.`
        );
        return true;
      }
      return false;
    }
  }

  return allItems;
}

// Retrieves items from a review URL with max retries
async function getItemsFromReviewURLWithRetry(
  page: Page,
  url: string,
  maxRetries: number
): Promise<Array<ReviewItem>> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const start = +new Date();
      const data = await getItemsFromReviewURL(page, url);
      return data; // Success, return the data
    } catch (error) {
      console.error(
        `getItemsFromReviewURLWithRetry ${
          attempt + 1
        }/${maxRetries} failed: ${error}`
      );
      if (attempt >= maxRetries - 1) throw error; // Last attempt, rethrow error
    }
  }
  // This code is unreachable - must have returned or re-thrown
  return [];
}

// Retrieves items from a review URL.
async function getItemsFromReviewURL(
  page: Page,
  url: string
): Promise<Array<ReviewItem>> {
  // timing - wait for the page to load
  const maxTimeout = 10000; // the default 30s might be too long, this is just being more explicit, in case we want to change it
  await page.goto(url, { waitUntil: "load", timeout: maxTimeout });

  // - wait for the table to be present (even if hidden)
  // this is simply 'table#books tbody#booksBody'
  const booksBodyLocator = page.locator("#booksBody");
  await booksBodyLocator.waitFor({ state: "attached" }); // state:attached means even if not visible

  const data = await booksBodyLocator.locator("tr").evaluateAll((rows) => {
    return rows.map((row) => {
      const id = row.getAttribute("id");
      const title = row?.querySelector(".field.title a")?.textContent?.trim();
      const author = row?.querySelector(".field.author a")?.textContent?.trim();
      const readCount = row
        ?.querySelector(".field.read_count .value")
        ?.textContent?.trim();

      const dateStartedValues = Array.from(
        row.querySelectorAll(".field.date_started .date_started_value")
      ).map((el: any) => el?.textContent?.trim());

      const dateReadValues = Array.from(
        row.querySelectorAll(".field.date_read .date_read_value")
      ).map((el: any) => el?.textContent?.trim());

      return {
        id,
        title,
        author,
        readCount,
        dateStartedValues,
        dateReadValues,
      };
    });
  });
  return data;
}

await main();
console.log("Done");

/**
 * Retrieves the credentials required for accessing the Goodreads API.
 * @throws {Error} If the GOODREADS_USERNAME or GOODREADS_PASSWORD environment variables are missing.
 */
function getCredentials(): Credentials {
  const GOODREADS_USERNAME = process.env.GOODREADS_USERNAME;
  const GOODREADS_PASSWORD = process.env.GOODREADS_PASSWORD;
  const GOODREADS_USER = process.env.GOODREADS_USER;
  const GOODREADS_KEY = process.env.GOODREADS_KEY;
  // null checks must be performed on fields for undefined check to propagate
  if (
    GOODREADS_USERNAME !== undefined &&
    GOODREADS_PASSWORD !== undefined &&
    GOODREADS_USER !== undefined &&
    GOODREADS_KEY !== undefined
  ) {
    return {
      GOODREADS_USERNAME,
      GOODREADS_PASSWORD,
      GOODREADS_USER,
      GOODREADS_KEY,
    };
  } else {
    throw new Error(
      "Missing GOODREADS_USERNAME, GOODREADS_PASSWORD, GOODREADS_USER, or GOODREADS_KEY environment variables."
    );
  }
}

// Creates a new Playwright page using the provided browser configuration.
async function getNewPlaywrightPage(
  browserConfig: BrowserConfig
): Promise<{ page: Page; browser: Browser }> {
  const { browserType, launchOptions } = browserConfig;
  const browser = await browserType.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, browser };
}

/**
 * Logs in to the Goodreads website using the provided credentials.
 *  timing is deliberately slow, to avoid captcha
 *  except the final signInSubmit, which we give a maxWait (2s) to settle back to the logged in home page
 */
async function login(credentials: Credentials, page: Page): Promise<boolean> {
  const maxWait = 20000;
  const { GOODREADS_USERNAME, GOODREADS_PASSWORD } = credentials;
  await page.goto("https://www.goodreads.com/user/sign_in");
  await page.waitForTimeout(1000);

  // Click on the "Sign in with email" button
  await page.click('div#choices a:has-text("Sign in with email")');
  await page.waitForTimeout(1000);

  // Fill in the username and password, don;t type too fast!
  await page.fill("#ap_email", GOODREADS_USERNAME);
  await page.waitForTimeout(1000);
  await page.fill("#ap_password", GOODREADS_PASSWORD);
  await page.waitForTimeout(1000);

  // Submit the form by clicking the sign in button
  await page.click("#signInSubmit");

  // the click submit will navigate back to the site root on success - where we can look for the 'My Books' link
  try {
    await page.waitForSelector('nav li a:has-text("My Books")', {
      timeout: maxWait,
    });
    // console.debug("- Login successful. 'My Books' link is visible.");
    return true;
  } catch (error) {
    console.error("- Login was not successful, 'My Books' link not found.");
  }
  // anything else is false; bads credentials of captcha
  return false;
}

function reviewURL(credentials: Credentials, params: ReviewURLParams): string {
  // throws if per_page is not defined, this is because we want to be explicit so that
  if (params.per_page === undefined) {
    throw new Error("per_page param is required");
  }
  const baseURL = "https://www.goodreads.com/review/list";
  // Convert numeric values to strings and construct a new object for URLSearchParams
  // because page, per_page are numeric
  const queryParams: Record<string, string> = Object.keys(params).reduce(
    (acc, key) => {
      acc[key] = String(params[key as keyof ReviewURLParams]);
      return acc;
    },
    {} as Record<string, string>
  );

  const query = new URLSearchParams(queryParams).toString();
  return `${baseURL}/${credentials.GOODREADS_USER}?${query}`;
}

function reviewURLParamsForShelf(shelf = "#ALL#"): ReviewURLParams {
  return {
    shelf,
    page: 1,
    per_page: 20,
    // date_read is the default when logged in
    // date_added is the default when not logged in, and cannot be changed
    // so we set it to date_added, and order=d so that we get the same behavior
    // wether we are logged in or not.
    sort: "date_added", // "date_updated" or "date_added"
    order: "d",
    utf8: "✓",
  };
}

async function getReadingProgress(
  page: Page,
  id: string
): Promise<Array<Object>> {
  await page.goto(`https://www.goodreads.com/review/show/${id}`);
  await page.waitForTimeout(1000);
  // ".readingTimeline .readingTimeline__row",
  // [
  //   'June 17, 2022\n–\n\nStarted Reading',
  //   'June 17, 2022\n– Shelved',
  //   'June 22, 2022\n–\n\nFinished Reading',
  //   'February 25, 2024\n–\n\nStarted Reading',
  //   'February 26, 2024\n–\n\n\n\n52.0%',
  //   'February 27, 2024\n–\n\nFinished Reading'
  // ]
  const readingProgress = await page.$$eval(
    ".readingTimeline .readingTimeline__row",
    (rows) => {
      return rows.map((row) => {
        // Get the full text and remove newline characters
        const fullText: string = row
          .querySelector(".readingTimeline__text")
          .textContent.replace(/\n/g, " ")
          .trim();

        // Split by '–' and use destructuring to separate date and event
        const [date, ...rest] = fullText.split("–").map((part) => part.trim());
        // warn if rest.length > 1
        if (rest.length !== 2) {
          console.warn("Unexpected event, should be exactly one '-'", row);
        }
        // join the rest back together, although rest.length should always be 1
        // if rest.length==0 then event:''
        // if rest.length>1 then we just join them back up with '-'
        const event = rest.join("-"); // join the rest back together

        return { date, event };
      });
    }
  );
  return readingProgress;
}
