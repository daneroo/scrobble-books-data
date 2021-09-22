import { exec } from "https://deno.land/x/exec/mod.ts";
await exec('node --version');

// import { readJSON, writeJSON, removeFile } from 'https://deno.land/x/flat@0.0.11/mod.ts' 

// Our injected url has https://www.goodreads.com/review/list_rss/USERID?key=SECRETKEY
const  GOODREADS_USER = Deno.env.get("GOODREADS_USER")
const  GOODREADS_KEY = Deno.env.get("GOODREADS_KEY")
const shelves = ['#ALL#', 'read', 'currently-reading', 'to-read', 'on-deck']

console.log({GOODREADS_USER,GOODREADS_KEY})
const URI = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER}`

const feed = { // indicate provenance - at least build stamp
  title: "Daniel's bookshelf: all",
  // title: 'ReplaceMe',
  // lastBuildDate: stamp,
  items: [] // Where we will accumulate the pages items
}
const shelf = shelves[0]

for (let page = 1; page < 3; page++) {
  const asXML = await fetcherXML(URI, { key:GOODREADS_KEY, shelf, page })

  const bookFilePFX = `goodreads-rss-p${page}`
  const bookFileXML = `${bookFilePFX}.xml`
  await Deno.writeTextFile(bookFileXML, asXML)
  console.log(`Wrote ${bookFileXML}`)

  // const pageFeed = await parseStringPromise(asXML)
  // const { rss: { channel } } = pageFeed
  // const title = channel?.[0]?.title?.[0]
  // feed.title = title // overwrite on every page - should all be the same
  // const lastBuildDate = channel?.[0]?.lastBuildDate?.[0]
  // const count = (channel?.[0].item || []).length
  // console.log(`${title} page:${page} count:${count} build:${lastBuildDate}`)


  //   prettyFeed(feed)
  // const pageItems = cleanFeed(pageFeed)

  // if (!pageItems || pageItems.length === 0) {
  //   // console.log('No more items')
  //   break
  // }
  // if (pageItems.length > 0) {
  //   console.log(pageItems[0])
  // }
  // feed.items = feed.items.concat(pageItems)
}

// // accumulated over pages: no '-pX' part in filename
// prettyFeed(feed)
// // my format
// const bookFilePFX = join(runDirectory, `goodreads-rss-${stamp}`)
// const bookFileJSON = `${bookFilePFX}.json`
// const asJSON = JSON.stringify(feed, null, 2)
// await fs.writeFile(bookFileJSON, asJSON)
// console.log(`\nscp -p ${bookFileJSON} ../site/public/books/goodreads-rss.json\n`)


// Optionally delete the original file
// await removeFile(filename)


// for xml:
async function fetcherXML (URI, qs = { }) {
  const qss = new URLSearchParams(qs).toString()
  const url = `${URI}?${qss}`
  // eslint-disable-next-line no-undef
  const response = await fetch(url)
  // console.info('fetched', url)
  //   const object = await results.json()
  //   return object
  const asXML = await response.text()
  return asXML
//   const feed = await parseStringPromise(asXML)
//   return feed
}
