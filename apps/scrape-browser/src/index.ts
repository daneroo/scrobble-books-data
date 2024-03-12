import fs from "fs/promises";

import { fetchAllReviewItems } from "./goodreads/reviews";
import type { Credentials, Engine, Shelf } from "./goodreads/types";

async function main() {
  try {
    const credentials = getCredentials();
    console.log("- Got credentials");

    const engines: Engine[] = ["html", "browser"]; //["browser"]; //["html", "browser"];
    const shelf: Shelf = "#ALL#";
    const listOptions = { shelf, per_page: 100 };
    const authenticate = true;
    const headless = false; // show you work!

    console.log(`# Fetch using engines: ${engines}`);
    console.log(`- first fetch all listing pages for selected shelf: ${shelf}`);
    console.log(`- then fetch each review page for reading progress\n`);
    for (const engine of engines) {
      console.log(`\n## Fetching items using *${engine}* engine`);
      const items = await fetchAllReviewItems({
        engine,
        headless,
        authenticate,
        credentials,
        listOptions,
      });
      // write the results to a file goodreads-${engine}.json (pretty printed)
      const itemsFile = `goodreads-${engine}.json`;
      await fs.writeFile(itemsFile, JSON.stringify(items, null, 2));
      console.log(`- Wrote ${items.length} items to ${itemsFile}`);
    }
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
// @ts-ignore
console.warn("process._getActiveRequests:", process._getActiveRequests());
// @ts-ignore
console.warn("process._getActiveHandles:", process._getActiveHandles());
console.log(
  "Force Exiting... cause something is hangin' around! (pending promises?)"
);
process.exit(0);

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
