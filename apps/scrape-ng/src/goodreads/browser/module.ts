import {
  type Browser,
  chromium,
  type LaunchOptions,
  type Page,
} from "playwright";

import { executeWithRetry } from "../retry";
import type { Credentials, FetchOptions, ReviewItem } from "../types";
import type { ListParams } from "../urls";
import { shelfIterator } from "../urls";

export async function justDoIt(
  fetchOptions: FetchOptions
): Promise<Array<ReviewItem>> {
  const { page, browser } = await getNewPlaywrightPage({
    headless: fetchOptions.headless,
  });
  console.log("- Got page and browser");

  if (fetchOptions.authenticated) {
    console.log("- Authenticating...");
    const loggedIn = await login(fetchOptions.credentials, page);
    console.log(`- Login: ${loggedIn}`);
    if (!loggedIn) {
      throw new Error("Login failed");
    }
    console.log("- Authenticated");
  }

  const items = await fetchAllReviewItems(page, fetchOptions);
  await page.close();
  await browser.close();
  return items;
}

/**
 * Fetches all review items from Goodreads.
 *  Browser-specific implementation (using Puppeteer)
 *
 * Iterates over review pages for a given shelf/per_page
 * and accumulates items from each page.
 * Also performs retry logic for each page.
 *
 * @param page - The page object for web scraping.
 * @param credentials - The credentials object containing user credentials.
 * @param listOptions - The parameters for iterating through the list of review items.
 * @returns A promise that resolves to an array of review items.
 */
export async function fetchAllReviewItems(
  page: Page,
  fetchOptions: FetchOptions
): Promise<Array<ReviewItem>> {
  const { credentials, listOptions } = fetchOptions;
  const maxPages = 100;
  const maxRetries = 5;

  const allItems: ReviewItem[] = [];

  for await (const { url, urlParams } of shelfIterator(
    credentials.GOODREADS_USER,
    listOptions
  )) {
    const start = +new Date();
    const items = await executeWithRetry(
      `${fetchOptions.engine}:fetchReviewItemsInPage(${JSON.stringify(
        listOptions
      )})`,
      () => fetchReviewItemsInPage(page, url), // Operation to retry
      maxRetries
    );
    allItems.push(...items);
    const elapsed = +new Date() - start;
    console.log(
      `- page:${urlParams.page} in ${elapsed}ms items:${
        items.length
      } ${JSON.stringify(urlParams)}`
    );
    console.debug(`  - url:${url}`);
    // termination conditions are in a inner function below
    if (shouldTerminate(items, urlParams, maxPages)) {
      break;
    }
  }

  return allItems;

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

/**
 * Fetches review items from a given Goodreads reviews page.
 * Meant to be called only from fetchAllReviewItems
 *
 * @param page - Playwright Page object for browser automation.
 * @param url - URL of the Goodreads reviews page to scrape.
 * @returns Promise resolving to an array of scraped review items.
 */
async function fetchReviewItemsInPage(
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

// Creates a new Playwright page using the provided browser configuration.
export async function getNewPlaywrightPage(
  launchOptions: LaunchOptions
): Promise<{ page: Page; browser: Browser }> {
  const browserType = chromium;
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
