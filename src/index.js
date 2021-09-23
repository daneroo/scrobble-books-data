// https://www.npmjs.com/package/xml2json - no cdata
// Trying https://www.npmjs.com/package/xml2js as in https://attacomsian.com/blog/nodejs-convert-xml-to-json

const { parseStringPromise } = require('xml2js')
const { promises: fs } = require('fs')
const { join } = require('path')

const fetch = require('node-fetch')

const GOODREADS_USER = process.env.GOODREADS_USER
const GOODREADS_KEY = process.env.GOODREADS_KEY

// console.log('node.js', { GOODREADS_USER, GOODREADS_KEY })
const URI = `https://www.goodreads.com/review/list_rss/${GOODREADS_USER}`
const shelves = ['#ALL#', 'read', 'currently-reading', 'to-read', 'on-deck']

main()

async function main () {
  try {
    const shelf = shelves[0]
    // const stamp = new Date().toISOString()
    const feed = { // indicate provenance - at least build stamp - we'll get that from the commit time!
      title: `Daniel's bookshelf: ${shelf}`,
      // lastBuildDate: stamp,
      items: [] // Where we will accumulate the pages items
    }

    // page index is 1 based, of course it is.
    for (let page = 1; page < 10; page++) {
      const asXML = await fetcherXML(URI, { key: GOODREADS_KEY, shelf, page })

      try {
        await fs.mkdir('xml-node')
      } catch (err) {
        if (err?.code !== 'EEXIST') throw err
      }
      const bookFileXML = join('xml-node', `goodreads-rss-p${page}.xml`)
      await fs.writeFile(bookFileXML, asXML)

      const pageFeed = await parseStringPromise(asXML)
      const { rss: { channel } } = pageFeed
      const title = channel?.[0]?.title?.[0]
      feed.title = title // overwrite on every page - should all be the same
      const lastBuildDate = channel?.[0]?.lastBuildDate?.[0]
      const count = (channel?.[0].item || []).length

      try {
        await fs.mkdir('json-node')
      } catch (err) {
        if (err?.code !== 'EEXIST') throw err
      }
      const bookFileJSON = join('json-node', `goodreads-rss-p${page}.node.json`)
      await fs.writeFile(bookFileJSON, JSON.stringify(pageFeed, null, 2))

      console.log(`${title} page:${page} count:${count} build:${lastBuildDate}`)

      //   prettyFeed(feed)
      const pageItems = cleanFeed(pageFeed)

      if (!pageItems || pageItems.length === 0) {
        // console.log('No more items')
        break
      }
      // if (pageItems.length > 0) {
      //   console.log(pageItems[0])
      // }
      feed.items = feed.items.concat(pageItems)
    }
    // accumulated over pages: no '-pX' part in filename
    prettyFeed(feed)
    // my format
    const bookFileJSON = 'goodreads-rss.node.json'
    const asJSON = JSON.stringify(feed, null, 2)
    await fs.writeFile(bookFileJSON, asJSON)
    console.log(`Wrote ${bookFileJSON}`)
  } catch (err) {
    console.error(err)
  }
}

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

// More validation - all levels
function cleanFeed (feed) {
  const { rss: { channel } } = feed
  if (!Array.isArray(channel) || channel.length !== 1) {
    console.error('Channel should be an array of size 1')
  }

  // item: may not be be present if no more items - ?break condition for loop
  const items = channel?.[0].item ?? []// which is an array
  return items.map(cleanItem)
}

function cleanItem (item) {
  const fieldMap = {
    guid: 'guid',
    pubDate: 'pubDate',
    title: 'title',
    link: 'link',
    bookId: 'book_id',
    bookImageURL: 'book_image_url',
    // book_small_image_url: 'book_small_image_url',
    // book_medium_image_url: 'book_medium_image_url',
    // book_large_image_url: 'book_large_image_url',
    bookDescription: 'book_description',
    // book: 'book', // <book id="13641406"> <num_pages>172</num_pages> </book>
    authorName: 'author_name',
    isbn: 'isbn',
    userName: 'user_name',
    userRating: 'user_rating',
    userReadAt: 'user_read_at',
    userDateAdded: 'user_date_added',
    userDateCreated: 'user_date_created',
    userShelves: 'user_shelves',
    userReview: 'user_review',
    averageRating: 'average_rating',
    bookPublished: 'book_published',
    description: 'description'
  }
  const newItem = { }
  for (const [newName, oldName] of Object.entries(fieldMap)) {
    //  check if array of length 1
    newItem[newName] = item[oldName][0]
  }
  // <book id="13641406"> <num_pages>172</num_pages> </book>
  newItem.numPages = item?.book?.num_pages ?? 0

  return newItem
}

function prettyFeed (feed) {
  const { title, lastBuildDate, items } = feed
  console.log(`${title}  count:${items.length} build:${lastBuildDate}`)

  if (!items.length) {
    console.log('No items')
  }
  for (const item of feed.items) {
    const { title, authorName, userRating, userReadAt, userShelves } = item
    console.log(`- ${title} by ${authorName} *:${userRating} ${userReadAt} shelf:${userShelves || 'read'}`)
  }
}
