import { join } from "https://deno.land/std@0.108.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.108.0/fs/mod.ts";

import { xml2js } from "https://cdn.skypack.dev/xml-js";

// import { readJSON, writeJSON, removeFile } from 'https://deno.land/x/flat@0.0.11/mod.ts'

// Our injected url has https://www.goodreads.com/review/list_rss/USERID?key=SECRETKEY
const GOODREADS_USER = Deno.env.get("GOODREADS_USER");
const GOODREADS_KEY = Deno.env.get("GOODREADS_KEY");

if (!GOODREADS_USER || !GOODREADS_KEY) {
  throw new Error("Missing GOODREADS_USER or GOODREADS_KEY environment variable");
}
const URI = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER}`;
const shelves = ["#ALL#", "read", "currently-reading", "to-read", "on-deck"];

const feed = { // indicate provenance - at least build stamp
  title: "Daniel's bookshelf: all",
  // lastBuildDate: stamp, // was for provenance, but we prefer not to cause file difference
  items: [], // Where we will accumulate the pages items
};
const shelf = shelves[0];

for (let page = 1; page < 10; page++) {
  const asXML = await fetcherXML(URI, { key: GOODREADS_KEY, shelf, page });

  await ensureDir("xml-deno");
  const bookFileXML = join("xml-deno", `goodreads-rss-p${page}.xml`);
  await Deno.writeTextFile(bookFileXML, asXML);
  console.log(`Wrote ${bookFileXML}`);

  const pageFeed = xml2js(asXML, { compact: true, spaces: 4 });

  await ensureDir("json-deno");
  const bookFileJSON = join("json-deno", `goodreads-rss-p${page}.deno.json`);
  await Deno.writeTextFile(bookFileJSON, JSON.stringify(pageFeed, null, 2));
  console.log(`Wrote ${bookFileJSON}`);

  const { rss: { channel } } = pageFeed;
  const title = channel?.title?._text;
  feed.title = title; // overwrite on every page - should all be the same

  // this was for provenance, but we prefer minimal changes and omit from output
  // const lastBuildDate = channel?.lastBuildDate?._text;

  const items = cleanItems(channel?.item ?? []);

  if (!items || items.length === 0) {
    // console.log("No more items");
    break;
  }
  feed.items = feed.items.concat(items);
}

// accumulated over pages: no '-pX' part in filename
prettyFeed(feed);
const bookFileJSON = `goodreads-rss.json`;
await Deno.writeTextFile(bookFileJSON, JSON.stringify(feed, null, 2));

// fetch a page as xml
async function fetcherXML(URI, qs = {}) {
  const qss = new URLSearchParams(qs).toString();
  const url = `${URI}?${qss}`;
  // eslint-disable-next-line no-undef
  const response = await fetch(url);
  // console.info('fetched', url)
  //   const object = await results.json()
  //   return object
  const asXML = await response.text();
  return asXML;
  //   const feed = await parseStringPromise(asXML)
  //   return feed
}

// More validation - all levels
function cleanItems(items) {
  return items.map(cleanItem);
}

function cleanItem(item) {
  const fieldMap = {
    guid: "guid",
    pubDate: "pubDate",
    title: "title",
    link: "link",
    bookId: "book_id",
    bookImageURL: "book_image_url",
    // book_small_image_url: 'book_small_image_url',
    // book_medium_image_url: 'book_medium_image_url',
    // book_large_image_url: 'book_large_image_url',
    bookDescription: "book_description",
    // book: 'book', // <book id="13641406"> <num_pages>172</num_pages> </book>
    authorName: "author_name",
    isbn: "isbn",
    userName: "user_name",
    userRating: "user_rating",
    userReadAt: "user_read_at",
    userDateAdded: "user_date_added",
    userDateCreated: "user_date_created",
    userShelves: "user_shelves",
    userReview: "user_review",
    averageRating: "average_rating",
    bookPublished: "book_published",
    description: "description",
  };

  //  use '' as sentinel/null - not undefined
  function safeDate(d) {
    try {
      return new Date(d).toISOString();
    } catch (e) {
      // swallow RangeError, else re-throw
      if (!(e instanceof RangeError)) {
        throw e;
      }
    }
      return "";
  }
  const newItem = {};
  for (const [newName, oldName] of Object.entries(fieldMap)) {
    //  use '' as sentinel/null - not undefined
    newItem[newName] = item[oldName]?._cdata ?? item[oldName]?._text ?? "";
  }
  newItem.pubDate = safeDate(newItem.pubDate);
  newItem.userReadAt = safeDate(newItem.userReadAt);
  newItem.userDateAdded = safeDate(newItem.userDateAdded);
  newItem.userDateCreated = safeDate(newItem.userDateCreated);
  // <book id="13641406"> <num_pages>172</num_pages> </book>
  newItem.numPages = item?.book?.num_pages?._text ?? "0";
  return newItem;
}

function prettyFeed({ title, items }) {
  const count = items.length;
  console.log(`${title} count:${count}`);
  if (!items.length) {
    console.log("No items");
  }
  for (const item of feed.items) {
    const { title, authorName, userRating, userReadAt, userShelves } = item;
    console.log(
      `- ${title} by ${authorName} *:${userRating} t:${userReadAt} shelf:${userShelves ||
        "read"}`,
    );
  }
}
