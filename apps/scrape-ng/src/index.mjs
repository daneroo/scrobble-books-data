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
    const start = +new Date();
    const credentials = getCredentials();
    console.log("Got credentials, or exited early.", +new Date() - start);

    const { page, browser } = await getNewPlaywrightPage(browserConfig);
    console.log("Got page and browser", +new Date() - start);

    const success = await login(credentials, page);
    console.log(`Login: ${success} in ${+new Date() - start}ms`);

    const per_page = success ? 100 : 20;

    // browsing by shelf
    for (const shelf of [
      // "currently-reading",
      // "on-deck",
      // "read",
      // "to-read",
      "#ALL#",
    ]) {
      console.log(`\n## Scanning shelf:${shelf}`);
      const params = reviewURLParamsForShelf(shelf);
      const withPerPageParams = { ...params, per_page };
      await reviewPageIterator(page, credentials, withPerPageParams);
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
    console.error(e.message);
    process.exit(1);
  }

  async function reviewPageIterator(page, credentials, params) {
    const maxPages = 100;
    let pageNumber = 1;
    while (true) {
      const pageParams = { ...params, page: pageNumber };
      const url = reviewURL(credentials, pageParams);
      const start = +new Date();
      const data = await getItemsFromReviewURL(page, url);
      console.log(
        `- page:${pageNumber} in ${+new Date() - start}ms items:${
          data.length
        } ${JSON.stringify(pageParams)}`
      );
      console.debug(`  - url:${url}`);
      if (data.length === 0) {
        console.info(`- break: no items:${data.length}`);
        break;
      }
      if (data.length < pageParams.per_page) {
        console.info(
          `- break: ${data.length} items < per_page:${pageParams.per_page} items, breaking`
        );
        break;
      }
      if (pageNumber > maxPages) {
        console.warn(
          `- break page:${page} of max:${maxPages} exceeded, breaking out of page loop.`
        );
        break;
      }
      pageNumber++;
    }
  }

  /**
   * Retrieves items from a review URL.
   *
   * @param {Page} page - The page object representing the browser page.
   * @param {string} url - The URL of the review page.
   * @returns {Promise<Array<Object>>} - A promise that resolves to an array of items retrieved from the review URL.
   */
  async function getItemsFromReviewURL(page, url) {
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

/**
 * Logs in to the Goodreads website using the provided credentials.
 *  timing is deliberately slow, to avoid captcha
 *  except the final signInSubmit, which we give a maxWait (2s) to settle back to the logged in home page
 * @param {Object} credentials - The login credentials.
 * @param {string} credentials.GOODREADS_USERNAME - The Goodreads username.
 * @param {string} credentials.GOODREADS_PASSWORD - The Goodreads password.
 * @param {Page} page - The Puppeteer page object.
 * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating whether the login was successful.
 */
async function login(credentials, page) {
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
    console.debug("- Login successful. 'My Books' link is visible.");
    return true;
  } catch (error) {
    console.error("- Login was not successful, 'My Books' link not found.");
  }
  // anything else is false; bads credentials of captcha
  return false;
}

function reviewURL(credentials, params) {
  // throws if per_page is not defined, this is because we want to be explicit so that
  if (params.per_page === undefined) {
    throw new Error("per_page param is required");
  }
  const baseURL = "https://www.goodreads.com/review/list";
  const query = new URLSearchParams(params).toString();
  return `${baseURL}/${credentials.GOODREADS_USER}?${query}`;
}

function reviewURLParamsForShelf(shelf = "#ALL#") {
  return {
    shelf,
    page: 1,
    // date_read is the default when logged in
    // date_added is the default when not logged in, and cannot be changed
    // so we set it to date_added, and order=d so that we get the same behavior
    // wether we are logged in or not.
    sort: "date_added", // "date_updated" or "date_added"
    order: "d",
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
