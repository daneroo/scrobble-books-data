import * as fs from "fs/promises";

import { decorateAllItemsWithReadingProgress } from "./goodreads/fetchReadingProgress";
import { fetchFeed } from "./goodreads/rss";
import type { Credentials, Shelf } from "./goodreads/types";

async function main() {
  try {
    const opts = parseCommandLineArgs();
    console.log({ opts });
    const {
      maxItems,
      maxPages,
      concurrency,
      shelf,
      verbosity,
      outputFilename,
    } = opts;

    const credentials = getCredentials();
    console.log("- Got credentials, or would have exited early.");

    const feed = await fetchFeed(credentials, {
      shelf,
      maxPages,
    });

    // trim the items to maxItems
    const allItems = feed.items;
    // now decorate the items with reading progress
    const maxedItems = maxItems < 0 ? allItems : allItems.slice(0, maxItems);
    feed.items = maxedItems;
    console.log(
      `- Got feed:${feed.title} with ${allItems.length} items ${
        maxedItems.length < allItems.length
          ? ` (trimmed to ${maxedItems.length})`
          : ""
      }`
    );
    await fs.writeFile(outputFilename, JSON.stringify(feed, null, 2));
    console.log(`- Wrote ${outputFilename}`);

    const outputFilenameWithProgress = outputFilename.replace(
      ".json",
      "-progress.json"
    );
    await decorateAllItemsWithReadingProgress(feed.items, concurrency);
    await fs.writeFile(
      outputFilenameWithProgress,
      JSON.stringify(feed, null, 2)
    );
    console.log(`- Wrote ${outputFilenameWithProgress}`);
  } catch (e) {
    if (e instanceof Error) {
      console.error(`Fatal error: ${e.message}`, e.stack);
    } else {
      console.error("An unknown error occurred", e);
    }
  }
}

await main();
console.log("Done");
// Following is just debug code meant to diagnose hanging process, and slow termination
// @ts-ignore
console.warn("process._getActiveRequests:", process._getActiveRequests());
// @ts-ignore
console.warn("process._getActiveHandles:", process._getActiveHandles());
console.log(
  "Force Exiting... cause something is hanging around! (pending promises?)"
);
process.exit(0);

type CmdOptions = {
  outputFilename: string;
  maxItems: number;
  maxPages: number;
  concurrency: number;
  shelf: Shelf;
  verbosity: number;
};

function parseCommandLineArgs(): CmdOptions {
  const args = process.argv.slice(2);
  // this would make it work under node and deno
  // if (typeof process !== "undefined") {
  //   args = process.argv.slice(2);
  // } else if (typeof Deno !== "undefined") {
  //   args = Deno.args;
  // }

  const options: CmdOptions = {
    outputFilename: "goodreads-rss-ng.json",
    maxItems: -1, // default to ALL
    maxPages: -1, // default to ALL
    concurrency: 3, // default to concurrent (3) processing
    shelf: "#ALL#", // default shelf
    verbosity: 0, // default verbosity
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-o":
      case "--output":
        options.outputFilename = args[++i];
        break;
      case "-n":
      case "--items":
        options.maxItems = parseInt(args[++i], 10);
        break;
      case "-p":
      case "--pages":
        options.maxPages = parseInt(args[++i], 10);
        break;
      case "-c":
      case "--concurrency":
        options.concurrency = parseInt(args[++i], 10);
        break;
      case "-s":
      case "--shelf":
        // options.shelf = args[++i];
        const shelfString = args[++i];
        // TODO(daneroo): how do I make this sane in the types? perhaps we'll have a general zod schema for types
        const validShelves: string[] = [
          "#ALL#",
          "currently-reading",
          "on-deck",
          "read",
          "to-read",
        ];
        if (validShelves.includes(shelfString)) {
          options.shelf = shelfString as Shelf;
        } else {
          throw new Error(`Invalid shelf: ${shelfString}`);
        }
        break;
      case "-v":
        options.verbosity = 1;
        break;
      case "-vv":
        options.verbosity = 2;
        break;
      case "-vvv":
        options.verbosity = 3;
        break;
      case "-h":
      case "--help":
        console.log(`
          Usage:
            -n, --items        Max number of items (default: -1 means ALL)
            -o, --output       Output file (default: goodreads-rss-ng.json)
            -p, --pages        Max number of feed pages to retrieve (default: -1 means ALL)
            -c, --concurrency  Max number of concurrent fetch operations for reading progress (default: ${options.concurrency})
            -s, --shelf        Goodreads shelf to fetch (default: #ALL#)
            -v, -vv, -vvv      Verbosity level (more 'v's for more verbose output)
            -h, --help         Show help information

          Examples:
            command -n 20 -vvv  Run with 20 items with high verbosity
            command --help      Show usage information
        `);
        process.exit(0);
    }
  }

  return options;
}

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
