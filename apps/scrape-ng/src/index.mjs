// @ts-check
import { chromium } from "playwright";
// const browserTypes = [chromium, firefox, webkit];

/**
 * @typedef {import('playwright').Browser} Browser
 * @typedef {import('playwright').Page} Page
 * @typedef {import('playwright').BrowserType<import('playwright').Browser>} BrowserType
 * @typedef {import('playwright').LaunchOptions} LaunchOptions
 * @typedef {import('playwright').BrowserContext} BrowserContext
 */

/**
 * @typedef {Object} Credentials
 * @property {string} GOODREADS_USERNAME - The username for the Goodreads account.
 * @property {string} GOODREADS_PASSWORD - The password for the Goodreads account.
 * @property {string} GOODREADS_USER - The user id for the Goodreads account.
 * @property {string} GOODREADS_KEY - The key for the Goodreads account. (Not sure if this is needed)
 */

/**
 * Configuration object for the browser.
 * @typedef {Object} BrowserConfig
 * @property {BrowserType} browserType - The type of browser to use.
 * @property {LaunchOptions} launchOptions - The options to use when launching the browser.
 */

/** @type {BrowserConfig} */
const browserConfig = {
  browserType: chromium,
  launchOptions: {
    headless: false,
  },
};

async function main() {
  //  get credentials early for early exit.
  console.log("Getting credentials");
  try {
    const credentials = getCredentials();
    console.log("Got credentials, or exited early.");

    const { page, browser } = await getNewPlaywrightPage(browserConfig);

    await login(credentials, page);

    // go to the stats page
    //  click on My Books, click on the stats link, lands here
    // await page.goto("https://www.goodreads.com/review/stats/6883912");
    // await page.waitForTimeout(1000);

    // browsing by year
    for (const year of [2024, 2023, 2022, 2021]) {
      const params = reviewURLParamsForYear(year);
      const maxPages = 20;
      let pageNumber = 1;
      while (true) {
        const pageParams = { ...params, page: pageNumber };
        const url = reviewURL(credentials, pageParams);
        const data = await getItemsFromReviewURL(page, url);
        console.log(
          `- year:${year} page:${pageNumber} items:${data.length} url:${url}`
        );
        if (data.length === 0) {
          break;
        }
        if (data.length < pageParams.per_page) {
          console.info(
            `Got ${data.length} items < per_page:${pageParams.per_page} items, breaking`
          );
          break;
        }
        if (pageNumber > maxPages) {
          console.warn(
            `maxPages of ${maxPages} exceeded, breaking out of page loop.`
          );
          break;
        }
        pageNumber++;
      }
    }
    await page.waitForTimeout(1000);

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
    console.error(e.message);
    process.exit(1);
  }

  /**
   * Retrieves items from a review URL.
   *
   * @param {Page} page - The page object representing the browser page.
   * @param {string} url - The URL of the review page.
   * @returns {Promise<Array<Object>>} - A promise that resolves to an array of items retrieved from the review URL.
   */
  async function getItemsFromReviewURL(page, url) {
    console.log(`- getItemsFromReviewURL:${url}`);
    // timing - wait for the page to load
    await page.goto(url, { waitUntil: "load" });

    // - wait for the table to be present (even if hidden)
    // this is simply 'table#books tbody#booksBody'
    const booksBodyLocator = page.locator("#booksBody");
    await booksBodyLocator.waitFor({ state: "attached" }); // state:attached means even if not visible

    const data = await booksBodyLocator.locator("tr").evaluateAll((rows) => {
      return rows.map((row) => {
        const id = row.getAttribute("id");
        const title = row?.querySelector(".field.title a")?.textContent?.trim();
        const author = row
          ?.querySelector(".field.author a")
          ?.textContent?.trim();
        const readCount = row
          ?.querySelector(".field.read_count .value")
          ?.textContent?.trim();

        const dateStartedValues = Array.from(
          row.querySelectorAll(".field.date_started .date_started_value")
        ).map((el) => el?.textContent?.trim());

        const dateReadValues = Array.from(
          row.querySelectorAll(".field.date_read .date_read_value")
        ).map((el) => el?.textContent?.trim());

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
}

await main();
console.log("Done");

/**
 * Retrieves the credentials required for accessing the Goodreads API.
 * @returns {Credentials} The credentials object containing the Goodreads username and password.
 * @throws {Error} If the GOODREADS_USERNAME or GOODREADS_PASSWORD environment variables are missing.
 */
function getCredentials() {
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

/**
 * Creates a new Playwright page using the provided browser configuration.
 *
 * @param {BrowserConfig} browserConfig - The configuration for the browser.
 * @returns {Promise<{ page: Page, browser: Browser }>} - The new Playwright page and browser.
 */
async function getNewPlaywrightPage(browserConfig) {
  const { browserType, launchOptions } = browserConfig;
  const browser = await browserType.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, browser };
}

async function login(credentials, page) {
  const { GOODREADS_USERNAME, GOODREADS_PASSWORD } = credentials;
  await page.goto("https://www.goodreads.com/user/sign_in");
  await page.waitForTimeout(1000);

  // Click on the "Sign in with email" button
  await page.click('div#choices a:has-text("Sign in with email")');
  await page.waitForTimeout(1000);

  // Fill in the username and password
  await page.fill("#ap_email", GOODREADS_USERNAME);
  await page.waitForTimeout(1000);
  await page.fill("#ap_password", GOODREADS_PASSWORD);
  await page.waitForTimeout(1000);
  // Submit the form by clicking the sign in button
  await page.click("#signInSubmit");
  // wait for the page submission to complete
  // confirm that we are logged in by waiting for the "My Books" link to appear
  console.log("- Should confirm we are logged in!");
  await page.waitForTimeout(1000);
}

function reviewURL(credentials, params) {
  const baseURL = "https://www.goodreads.com/review/list";
  const query = new URLSearchParams(params).toString();
  return `${baseURL}/${credentials.GOODREADS_USER}?${query}`;
}

// TODO(daneroo): Add JSDoc and should be paged
function reviewURLParamsForYear(year) {
  return {
    read_at: year,
    page: 1,
    per_page: 100,
    utf8: "✓",
  };
}

function reviewURLParamsForShelf(shelf = "#ALL#") {
  return {
    shelf,
    page: 1,
    per_page: 100,
    utf8: "✓",
  };
}

async function getReadingProgress(page, id) {
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
        let fullText = row
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
