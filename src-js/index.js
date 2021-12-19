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

  const storage = new Web3Storage({ token })

  const files = await getFilesFromPath(feedFilename)
  const cid = await storage.put(files, putOptions)

  await writeFile(ipfsFilename, JSON.stringify({ cid }, null, 2))

  console.log(`Content for ${putOptions.name} added with CID: ${cid}`)
}

main()
