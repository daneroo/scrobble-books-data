import { ensureDir, join, parseFeed } from "./deps.ts";
import { fetcherXML } from "./fetcherXML.ts";

// working directories for intermediate pages (upstream api is paged)
const xmlDataDir = "data/xml";
const jsonDataDir = "data/rss-json";
// final output
const bookFileJSON = `goodreads-rss.json`;

// Our injected url has https://www.goodreads.com/review/list_rss/USERID?key=SECRETKEY
const GOODREADS_USER = Deno.env.get("GOODREADS_USER");
const GOODREADS_KEY = Deno.env.get("GOODREADS_KEY");

if (!GOODREADS_USER || !GOODREADS_KEY) {
  throw new Error(
    "Missing GOODREADS_USER or GOODREADS_KEY environment variable"
  );
}
const URI = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER}`;
const shelves = ["#ALL#", "read", "currently-reading", "to-read", "on-deck"];

const feed = {
  title: "Daniel's bookshelf: all",
  // lastBuildDate: stamp, // was for provenance, but we prefer not to cause file difference
  items: [], // Where we will accumulate the pages items
};
const shelf = shelves[0];

for (let page = 1; page < 15; page++) {
  const asXML = await fetcherXML(URI, { key: GOODREADS_KEY, shelf, page });

  await ensureDir(xmlDataDir);
  const bookFileXML = join(xmlDataDir, `goodreads-rss-p${page}.xml`);
  await Deno.writeTextFile(bookFileXML, asXML);
  console.log(`Wrote ${bookFileXML}`);

  try {
    const pageFeed = await parseFeed(asXML);
    console.log(`Parsed page ${page}`);

    await ensureDir(jsonDataDir);
    const rssPageJSON = join(jsonDataDir, `goodreads-rss-p${page}.json`);
    await Deno.writeTextFile(rssPageJSON, JSON.stringify(pageFeed, null, 2));
    console.log(`Wrote ${rssPageJSON}`);

    // console.log(JSON.stringify(pageFeed, null, 2));
    // const {
    //   rss: { channel },
    // } = pageFeed;
    const title = pageFeed?.title?.value;
    feed.title = title; // overwrite on every page - should all be the same

    const items = cleanItems(pageFeed.entries);

    if (!items || items.length === 0) {
      console.log("No more entries");
      break;
    }
    feed.items = feed.items.concat(items);
  } catch {
    console.log(`No entries in page ${page}`);
    console.log("No more entries");
    break;
  }
}

// accumulated over pages: no '-pX' part in filename
prettyFeed(feed);
await Deno.writeTextFile(bookFileJSON, JSON.stringify(feed, null, 2));

// More validation - all levels
function cleanItems(items) {
  return items.map(cleanItem);
}

function cleanItem(item) {
  const fieldMap = {
    // guid: "id", // move to id
    // title: "title",
    // See below these two are special cases (nested/indexed)
    // link: "link", // see below as links[0].href ?? ""
    // numPages: "book.num_pages"
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
  newItem.id = item?.id?.value ?? item?.id ?? "";
  newItem.title = item?.title?.value ?? item?.title ?? "";
  newItem.link = item?.links?.[0]?.href ?? "";

  for (const [newName, oldName] of Object.entries(fieldMap)) {
    //  use '' as sentinel/null - not undefined
    newItem[newName] = item[oldName]?.value ?? item[oldName] ?? "";
  }

  newItem.numPages = item?.book?.num_pages?.value ?? "0";

  // newItem.pubDate = safeDate(newItem.pubDate);
  newItem.userReadAt = safeDate(newItem.userReadAt);
  newItem.userDateAdded = safeDate(newItem.userDateAdded);
  newItem.userDateCreated = safeDate(newItem.userDateCreated);

  // Round the average rating to 0.1 (toFixed(1)) to reduce commit noise
  // Also, replace the same average rating in the description field
  const averageRating = newItem.averageRating; // string
  const roundedAverageRating = Number(averageRating).toFixed(1);
  // passthrough if original field was NaN
  if (!isNaN(roundedAverageRating)) {
    // console.log(`Rating ${averageRating} -> ${roundedAverageRating}`);
    newItem.averageRating = roundedAverageRating;

    // now, also replace the text in description with new average rating
    const description = newItem.description.replace(
      `average rating: ${averageRating}`,
      `average rating: ${roundedAverageRating}`
    );
    // console.log(`Description ${newItem.description} -> ${description}`);
    newItem.description = description;
  }

  return newItem;
}

function prettyFeed({ title, items }) {
  const count = items.length;
  console.log(`feed: ${title} count:${count}`);
  if (!items.length) {
    console.log("No items");
  }
  for (const item of feed.items) {
    const { title, authorName, userRating, userReadAt, userShelves } = item;
    console.log(
      `- ${title} by ${authorName} *:${userRating} t:${userReadAt} shelf:${
        userShelves || "read"
      }`
    );
  }
  console.log(`feed: ${title} count:${count}`);
}
