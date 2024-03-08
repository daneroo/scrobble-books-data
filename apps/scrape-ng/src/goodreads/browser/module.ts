import {
  type Browser,
  chromium,
  type LaunchOptions,
  type Page,
} from "playwright";

import type {
  Credentials,
  FetchOptions,
  ReviewItem,
  ScrapingContext,
} from "../types";

/**
 * Creates a scraping context based on the provided fetch options for the browser(puppeteer) engine.
 * @param fetchOptions - The options for fetching the review items.
 * @returns A promise that resolves to a scraping context.
 */
export async function createContext(
  fetchOptions: FetchOptions
): Promise<ScrapingContext> {
  // de-structured assignment requites extra parentheses
  const { page, browser } = await getNewPlaywrightPage({
    headless: fetchOptions.headless,
  });

  // Optional: perform login or other setup steps here, depending on fetchOptions
  if (fetchOptions.authenticated) {
    console.log("- Authenticating...");
    const loggedIn = await login(fetchOptions.credentials, page);
    console.log(`- Login: ${loggedIn}`);
    if (!loggedIn) {
      throw new Error("Login failed");
    }
    console.log("- Authenticated");
  }

  return {
    cleanup: async () => {
      // Ensure both page and browser instances are closed
      await page.close();
      await browser.close();
    },
    fetchReviewItemsInPage: async (url: string) => {
      // Delegate to a specific Puppeteer implementation that uses the page instance
      return fetchReviewItemsInPage(page, url);
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

  const items = await booksBodyLocator.locator("tr").evaluateAll((rows) => {
    return rows.map((row) => {
      const id = row.getAttribute("id");
      const reviewId = id.split("_")?.[1] ?? "";

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
        reviewId,
        title,
        author,
        readCount,
        dateStartedValues,
        dateReadValues,
      };
    });
  });
  // console.log(`- Fetching reading progress for ${items.length} items`);
  // for (const item of items) {
  //   const { reviewId } = item;
  //   if (!reviewId) {
  //     console.warn(
  //       `  - Skipping item with no reviewId: ${JSON.stringify(item)}`
  //     );
  //     continue;
  //   } else {
  //     console.log(
  //       `  - Progress for ${item.reviewId} - ${item.author} - ${item.title}`
  //     );
  //     // get the actual id from the is string: review_4789085379
  //     const id = item.id.split("_")[1];
  //     const readingProgress = await getReadingProgress(page, id);
  //     // item.readingProgress = readingProgress;
  //   }
  // }

  return items;
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
