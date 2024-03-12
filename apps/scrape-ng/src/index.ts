import * as fs from "fs/promises";

import { fetchFeed } from "./goodreads/rss";
import type { Credentials, Shelf } from "./goodreads/types";

async function main() {
  try {
    const credentials = getCredentials();
    console.log("- Got credentials, or would have exited early.");

    const shelf: Shelf = "#ALL#";
    const feed = await fetchFeed(credentials, shelf);
    console.log(`- Got feed:${feed.title} with ${feed.items.length} items`);
    const bookFileJSON = `goodreads-rss.json`;

    await fs.writeFile(bookFileJSON, JSON.stringify(feed, null, 2));
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
  "Force Exiting... cause something is hanging around! (pending promises?)"
);
process.exit(0);

/**
 * Retrieves the credentials required for accessing the Goodreads API.
 * @throws {Error} If the GOODREADS_USERNAME or GOODREADS_PASSWORD environment variables are missing.
 */
function getCredentials(): Credentials {
  const GOODREADS_USER = process.env.GOODREADS_USER;
  const GOODREADS_KEY = process.env.GOODREADS_KEY;
  // null checks must be performed on fields for undefined check to propagate
  if (GOODREADS_USER !== undefined && GOODREADS_KEY !== undefined) {
    return {
      GOODREADS_USER,
      GOODREADS_KEY,
    };
  } else {
    throw new Error(
      "Missing GOODREADS_USERNAME, GOODREADS_PASSWORD, GOODREADS_USER, or GOODREADS_KEY environment variables."
    );
  }
}
