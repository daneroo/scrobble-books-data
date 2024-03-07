// Re-export everything under browser and html namespaces
import * as browser from "./browser/module";
import * as html from "./html/module";
// no longer need to export { browser, html };
import type { FetchOptions, ReviewItem } from "./types";

export async function fetchAllReviewItems(
  fetchOptions: FetchOptions
): Promise<Array<ReviewItem>> {
  if (fetchOptions.engine === "browser") {
    // Use Puppeteer
    return browser.justDoIt(fetchOptions);
  } else if (fetchOptions.engine === "html") {
    // Use Cheerio
    return html.fetchAllReviewItems(fetchOptions);
  } else {
    throw new Error(`Unsupported engine: ${fetchOptions.engine}`);
  }
}
