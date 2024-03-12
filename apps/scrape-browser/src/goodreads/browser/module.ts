import type { Browser, LaunchOptions, Page } from "playwright";
import { chromium } from "playwright";

import type {
  AuthState,
  Credentials,
  FetchOptions,
  ReadingProgress,
  ReviewItem,
  ScrapingContext,
} from "../types";
import { itemURL } from "../urls";

/**
 * Creates a scraping context based on the provided fetch options for the browser(playwright) engine.
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
  const authState: AuthState = await traceLogin();

  async function traceLogin(): Promise<AuthState> {
    // Optional: perform login or other setup steps here, depending on fetchOptions
    if (fetchOptions.authenticate) {
      console.log("- Authenticating...");
      const start = +new Date();
      // TODO(daneroo) - add retry - executeWithRetry
      const authState = await login(fetchOptions.credentials, page);
      const elapsed = +new Date() - start;
      console.log(`- Login: ${authState.authenticated} in ${elapsed}ms`);
      if (!authState.authenticated) {
        throw new Error("Login failed in ${elapsed}ms.");
      }
      console.log("- Authenticated");
      return authState;
    } else {
      return { authenticated: false, cookie: "" };
    }
  }

  return {
    getAuthState: () => authState,
    cleanup: async () => {
      // Ensure both page and browser instances are closed
      await page.close();
      await browser.close();
    },
    fetchReviewItemsInPage: async (url: string) => {
      // Delegate to a specific browser implementation that uses the page instance
      return fetchReviewItemsInPage(page, url);
    },
    fetchReadingProgress: async (id: string) => {
      return fetchReadingProgress(page, id);
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
      // Cannot reuse my removeLast function (typescript and in another module) - so I will just copy it here
      // @ts-ignore
      function removeLast(str, pattern) {
        if (!pattern) {
          return str; // Return original string if pattern is falsy
        }
        const lastIndex = str.lastIndexOf(pattern);
        if (lastIndex !== -1) {
          return (
            str.slice(0, lastIndex) + str.slice(lastIndex + pattern.length)
          );
        }
        return str; // Return original string if pattern is not found
      }
      const id = row.getAttribute("id");
      const reviewId = id.split("_")?.[1] ?? "";

      const titleWithSeries =
        row.querySelector(".field.title a")?.textContent?.trim() ?? "";
      const series =
        row.querySelector(".field.title a span")?.textContent?.trim() ?? "";
      const title = removeLast(titleWithSeries, series).trim();

      const author = row?.querySelector(".field.author a")?.textContent?.trim();
      const readCount = row
        ?.querySelector(".field.read_count .value")
        ?.textContent?.trim();

      // TODO(daneroo) - this is bad in the static text - it contains the rating column!!
      const shelves = Array.from(
        row.querySelectorAll(".field.shelves .shelfLink")
      ).map((el: any) => el?.textContent?.trim());

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
        series,
        author,
        readCount,
        shelves,
        dateStartedValues,
        dateReadValues,
      };
    });
  });
  return items;
}

async function fetchReadingProgress(
  page: Page,
  reviewId: string
): Promise<ReadingProgress> {
  const url = itemURL(reviewId);
  const maxTimeout = 5000; // the default 30s might be too long, this is just being more explicit, in case we want to change it
  await page.goto(url, {
    waitUntil: "load",
    timeout: maxTimeout,
  });

  // ".readingTimeline .readingTimeline__row",
  // [
  //   'June 17, 2022\n–\n\nStarted Reading',
  //   'June 17, 2022\n– Shelved',
  //   'June 22, 2022\n–\n\nFinished Reading',
  //   'February 25, 2024\n–\n\nStarted Reading',
  //   'February 26, 2024\n–\n\n\n\n52.0%',
  //   'February 27, 2024\n–\n\nFinished Reading'
  // ]

  // Works with a single shelf
  //  and we would return     shelves: [firstShelf],
  // const firstShelf = (await page.$eval(
  //   "span.userReview + a.actionLinkLite",
  //   (el) => el.textContent
  // )) as string;

  // This has not been validated with multiple shelves
  // But it works when there is a single shelf, and returns an array properly
  const shelves = await page.$$eval(
    "span.userReview ~ a.actionLinkLite",
    (elements) => elements.map((el) => el.textContent.trim())
  );

  const timeline = await page.$$eval(
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
  const readingProgress: ReadingProgress = {
    reviewId,
    shelves,
    timeline,
  };
  return readingProgress;
}

// Creates a new Playwright page using the provided browser configuration.
export async function getNewPlaywrightPage(
  launchOptions: LaunchOptions
): Promise<{ page: Page; browser: Browser }> {
  const browserType = chromium;
  // const browserType = webkit;
  // const browserType = firefox;
  const browser = await browserType.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, browser };
}

/**
 * Logs in to the Goodreads website using the provided credentials.
 *  slowing down with waitForTimeout's doesn't seem to be necessary
 */
async function login(credentials: Credentials, page: Page): Promise<AuthState> {
  const maxTimeout = 10000; // the default 30s might be too long, this is just being more explicit, in case we want to change it
  const { GOODREADS_USERNAME, GOODREADS_PASSWORD } = credentials;

  const url = "https://www.goodreads.com/user/sign_in";
  await page.goto(url, { waitUntil: "load", timeout: maxTimeout });

  // Click on the "Sign in with email" button
  await page.click('div#choices a:has-text("Sign in with email")');
  // this causes a navigation event to `https://goodreads.com/ap/signin`
  await page.waitForSelector("#ap_email"); // Waits for the email input field to be present
  // Fill in the username and password, don;t type too fast! (or does it even matter?) after all
  await page.fill("#ap_email", GOODREADS_USERNAME);
  await page.waitForTimeout(200);
  await page.fill("#ap_password", GOODREADS_PASSWORD);
  await page.waitForTimeout(200);

  // Submit the form by clicking the sign in button
  await page.click("#signInSubmit");
  // "#signInSubmit" is on https://www.goodreads.com/ap/signin
  // navigates to https://www.goodreads.com/
  try {
    await page.waitForURL("https://www.goodreads.com/", {
      timeout: maxTimeout,
      waitUntil: "load",
    });
  } catch (e) {
    // console.error("Post login waitForURL failed", e);
    throw new Error("Post Login waitForURL(https://www.goodreads.com/) failed");
  }

  {
    const start = +new Date();
    const htmlDocument = await page.content();
    const elapsed = +new Date() - start;
    console.log(`- PageContent: ${elapsed}ms`);
    // TODO(daneroo) - move this to utils function and test
    // goodreads.com header script always contain script tag with either of these
    // if (window.ue && window.ue.tag) { window.ue.tag('home:index:signed_in', ue.main_scope);window.ue.tag('home:index:signed_in:desktop', ue.main_scope); }
    // if (window.ue && window.ue.tag) { window.ue.tag('home:index:signed_out', ue.main_scope);window.ue.tag('home:index:signed_out:desktop', ue.main_scope); }
    // if (window.ue && window.ue.tag) { window.ue.tag('review:list:signed_in', ue.main_scope);window.ue.tag('review:list:signed_in:desktop', ue.main_scope); }
    const isLoggedIn = htmlDocument.includes(":signed_in'");
    if (isLoggedIn) {
      const cookies = await page
        .context()
        .cookies("https://www.goodreads.com/");
      const cookieValues = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      //  TODO(daneroo) - move this to util function and test
      // console.log(`- Cookie: ${cookieValues}`);
      // const response = await fetch(url, {
      //   headers: {
      //     Cookie: cookieValues,
      //   },
      // });
      // const text = await response.text();
      // await fs.writeFile("auth-cookie-test.html", text);

      return { authenticated: true, cookie: cookieValues };
    }
    console.error(
      "- Login was not successful, 'home:index:signed_in' not found in page."
    );
    const isLoggedOut = htmlDocument.includes("'home:index:signed_out'");
    if (!isLoggedOut) {
      console.debug(
        "- Login not successful but still expected 'home:index:signed_out' to be found."
      );
    }
  }

  // anything else is false; bad credentials or captcha
  return { authenticated: false, cookie: "" };
}
