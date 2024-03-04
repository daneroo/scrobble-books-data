import { chromium } from "playwright";

// Importing types
import type { Browser, Page, BrowserType, LaunchOptions } from "playwright";
import type { Shelf } from "./goodreads/urls";
import { fetchAllReviewItems } from "./goodreads/reviews";

export interface Credentials {
  GOODREADS_USERNAME: string;
  GOODREADS_PASSWORD: string;
  GOODREADS_USER: string;
  GOODREADS_KEY: string;
}

interface BrowserConfig {
  browserType: BrowserType<Browser>;
  launchOptions: LaunchOptions;
}

export interface ReviewItem {
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
      const listParams = { shelf, per_page };
      const data = await fetchAllReviewItems(page, credentials, listParams);
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
