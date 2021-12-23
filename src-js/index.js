// This code was taken from
//  https://github.com/web3-storage/web3.storage/blob/main/packages/client/examples/node.js/put-files-from-fs.js

// import { Web3Storage, getFilesFromPath } from 'web3.storage'
const { Web3Storage, getFilesFromPath } = require('web3.storage')
const { writeFile } = require('fs').promises

// relative to invocation directory (repo root for now)
const feedFilename = 'goodreads-rss.json'
const ipfsFilename = 'goodreads-ipfs.json'
const putOptions = {
  name: `${feedFilename}-${new Date().toISOString()}`, // name of upload on we3.storage
  wrapWithDirectory: true // which is the default
}

async function main () {
  const token = process.env.WEB3STORAGE_TOKEN

  if (!token) {
    console.error(
      'Missing WEB3STORAGE_TOKEN environment variable'
    )
    process.exit(1)
  }

  // create the Web3Storage instance
  const storage = new Web3Storage({ token })

  // put our single file of interest into a CAR and store it
  const files = await getFilesFromPath(feedFilename)
  const cid = await storage.put(files, putOptions)

  // record the latest CID in a file
  await writeFile(ipfsFilename, JSON.stringify({ cid }, null, 2))

  console.log(`- Stored ${putOptions.name} CID: ${cid}`)

  // get all uploaded (pinned) files (as an asyncIterable)
  const uploads = await storage.list()

  // Below is the code to delete previous uploads (keeping N most recent)
  const numberToKeep = 3
  await deletePreviousUploads(uploads, feedFilename, numberToKeep)
}

main()

// upload item comparator ( for sorting upload items by descending created timestamp)
function createdDescendingStampComparator (a, b) {
  // The typical sign of return is reversed because the comparator is "Descending"
  if (a?.created < b?.created) {
    return 1
  }
  if (a?.created > b?.created) {
    return -1
  }
  // a must be equal to b
  return 0
}

// uploads is an asyncIterable of upload items
async function deletePreviousUploads (uploads, prefixUploadName, numberToKeep) {
  console.log(`- Delete previous uploads matching ${prefixUploadName}*, keeping ${numberToKeep} entries`)

  // filter for files uploaded by this script (prefix of feedFilename)
  const matchingUploads = []
  for await (const upload of uploads) {
    if (upload?.name.startsWith(prefixUploadName)) {
      matchingUploads.push(upload)
    } else {
      console.log(`Excluding ${upload.name} CID: ${upload.cid}`)
    }
  }
  console.log(`- Found ${matchingUploads.length} matches`)

  // sort matchingUploads in place, but give it a new symbol for clarity
  const sortedDescendingMatchingUploads = matchingUploads.sort(createdDescendingStampComparator)

  // keep first 'keepers' entries (delete all others)
  const toDelete = sortedDescendingMatchingUploads.slice(numberToKeep)
  console.log(`Keeping ${numberToKeep} entries, about to delete ${toDelete.length} entries`)
  for (const upload of toDelete) {
    console.log(`Would delete ${upload.name} CID: ${upload.cid}`)
    // .delete not implemented yet
    // const deletedCID = await storage.delete(upload.cid)
    // console.log(`Deleted CID: ${deletedCID}`)
  }
}
