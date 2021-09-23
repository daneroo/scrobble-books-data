import { xml2js } from "https://cdn.skypack.dev/xml-js";

// import { readJSON, writeJSON, removeFile } from 'https://deno.land/x/flat@0.0.11/mod.ts'

// Our injected url has https://www.goodreads.com/review/list_rss/USERID?key=SECRETKEY
const GOODREADS_USER = Deno.env.get("GOODREADS_USER");
const GOODREADS_KEY = Deno.env.get("GOODREADS_KEY");
// console.log({GOODREADS_USER,GOODREADS_KEY})
const URI = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER}`;
const shelves = ["#ALL#", "read", "currently-reading", "to-read", "on-deck"];

const feed = { // indicate provenance - at least build stamp
  title: "Daniel's bookshelf: all",
  // title: 'ReplaceMe',
  // lastBuildDate: stamp,
  items: [], // Where we will accumulate the pages items
};
const shelf = shelves[0];

for (let page = 1; page < 10; page++) {
  const asXML = await fetcherXML(URI, { key: GOODREADS_KEY, shelf, page });

  const bookFileXML = `goodreads-rss-p${page}.xml`;
  await Deno.writeTextFile(bookFileXML, asXML);
  console.log(`Wrote ${bookFileXML}`);

  const pageFeed = xml2js(asXML, { compact: true, spaces: 4 });

  const bookFileJSON = `goodreads-rss-p${page}.deno.json`;
  await Deno.writeTextFile(bookFileJSON, JSON.stringify(pageFeed, null, 2));
  console.log(`Wrote ${bookFileJSON}`);

  // console.log(asJSON)
  console.log(Object.keys(pageFeed));
  const { rss: { channel } } = pageFeed;
  const title = channel?.title?._text;
  feed.title = title; // overwrite on every page - should all be the same

  // this was for provenance, but we prefer idempotence, and omit from output
  const lastBuildDate = channel?.lastBuildDate?._text;

  const items = cleanItems(channel?.item ?? []);

  if (!items || items.length === 0) {
    console.log("No more items");
    break;
  }
  // if (pageItems.length > 0) {
  //   console.log(pageItems[0])
  // }
  feed.items = feed.items.concat(items);
}

// // accumulated over pages: no '-pX' part in filename
prettyFeed(feed);
// // my format
// const bookFilePFX = join(runDirectory, `goodreads-rss-${stamp}`)
// const bookFileJSON = `${bookFilePFX}.json`
// const asJSON = JSON.stringify(feed, null, 2)
// await fs.writeFile(bookFileJSON, asJSON)
// console.log(`\nscp -p ${bookFileJSON} ../site/public/books/goodreads-rss.json\n`)

// Optionally delete the original file
// await removeFile(filename)

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
  function safeDate(d) {
    try {
      new Date(d).toISOString();
    } catch (error) {
      return null;
    }
  }
  const newItem = {};
  for (const [newName, oldName] of Object.entries(fieldMap)) {
    //  check if array of length 1
    newItem[newName] = item[oldName]?._cdata || item[oldName]?._text;
  }
  newItem.userReadAt = safeDate(newItem.userReadAt);
  newItem.userDateAdded = safeDate(newItem.userDateAdded);
  newItem.userDateCreated = safeDate(newItem.userDateCreated);
  // <book id="13641406"> <num_pages>172</num_pages> </book>
  newItem.numPages = item?.book?.num_pages?._text ?? 0;
  // console.log(newItem);
  return newItem;
}

function prettyFeed({ title, lastBuildDate, items }) {
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
