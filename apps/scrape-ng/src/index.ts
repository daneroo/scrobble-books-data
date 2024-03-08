import fs from "fs/promises";

import { fetchAllReviewItems } from "./goodreads/reviews";
import type { Credentials, Engine, Shelf } from "./goodreads/types";

async function main() {
  try {
    const credentials = getCredentials();
    console.log("- Got credentials, or would have exited early.");

    const engines: Engine[] = ["html", "browser"]; //["browser"]; //["html", "browser"];
    for (const engine of engines) {
      const shelf: Shelf = "#ALL#";
      const listOptions = { shelf, per_page: engine === "browser" ? 100 : 20 };
      const items = await fetchAllReviewItems({
        engine,
        headless: false,
        authenticated: engine === "browser" ? true : false,
        credentials,
        listOptions,
      });
      // write the results to a file goodreads-${engine}.json (pretty printed)
      const itemsFile = `goodreads-${engine}.json`;
      await fs.writeFile(itemsFile, JSON.stringify(items, null, 2));
      console.log(`- Wrote ${items.length} items to ${itemsFile}`);
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
