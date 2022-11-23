# scrobble-books-data

[![CI - lint and unit tests](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml/badge.svg?branch=main)](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml)

Tracking reading data

This repo archives the latest version of my reading data every 20 minutes.

You can look at
[the formatted data table here](https://flatgithub.com/daneroo/scrobble-books-data).

## Description

Performs 2 tasks as a cron trigger github action:

- scrape latest reading data (goodreads)
  - `goodreads-rss.json`
- pins the the file to web3.storage (ipfs)
  - `goodreads-ipfs.json` contains the pinned CID
- commits any changes back to the repo

The scraper was originally written with `deno`
because we were using githubocto/flat@v3, which uses Deno/Typescript as it's
post-processor.

## Usage

The data file ca be fetched (externally) at

- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json>.
- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-ipfs.json>.

The pinned CID's can be found at

- <https://web3.storage/account/>

## Upstream PR for setup-cue

- <https://github.com/cue-lang/setup-cue/pull/10>
- I am currently using my own fork (pinned to main)

## TODO

- [ ] use deno with npm packages
  - implement a deno version of ipfs pinning
  - import we3.storage from npm | esm.sh | unpkg
  - replace package.json scripts with deno ...
  - deno udd: npm outdated, deps.ts best practices
- [ ] Restore cue-lang/setup-cue@??? (when upstream and released (PR is merged))
- [ ] use ipfs pins for web3.storage - not ready yet - requires an IPFS node
- [ ] Sync? [Literal API](https://literal.club/pages/api)
- Rewrite github actions with cue !?
- Use a mono repo ([turborepo](https://turborepo.org/))
  - Move deno source to typescript cli project
- Remove redundant CID's in web3.storage (.delete not implemented - requires MAGIC_LINK - cannot call API)
- Use CBOR instead of files?
- Clean up the data more
  - Removed unused fields (description, etc)
  - Use cuelang validation (perhaps part of e2e tests)
  - [CueBlox](https://www.cueblox.com/): see if it appropriate to use
- ~~Done~~
- ~~[Integrate VSCode](https://deno.land/manual@v1.14.1/vscode_deno)~~
- ~~Use [Skypack's xml2js](https://www.skypack.dev/view/xml2js)~~

## Web3.Storage Pinning service (new)

### Using web API

This just lists the pinned CID's, but cannot upload content. So we still need a working IPFS node.

```bash
# list with http request - add ?status=.. (not documented yet)
. WEB3STORAGE.env
time curl -s -X GET 'https://api.web3.storage/pins?status=failed,pinned,pinning,queued' --header 'Accept: */*' --header "Authorization: Bearer ${WEB3STORAGE_TOKEN}" | jq
```

### using ipfs (go) cli

```bash

ipfs pin remote service add web3.storage https://api.web3.storage/ <YOUR_AUTH_KEY_JWT>
. WEB3STORAGE.env
ipfs pin remote service add web3.storage https://api.web3.storage/ "${WEB3STORAGE_TOKEN}"

ipfs pin remote add --service=web3.storage --name=<PIN_NAME> <CID>
ipfs pin remote add --service=web3.storage --name=a-goodreeads-folder bafybeib7ef3pesqbvjjq5dgdteztaxb2v2mkk56yzfltet4mluyy6oakpi

ipfs pin remote ls --service=web3.storage

ipfs pin remote rm --service=web3.storage --cid=<CID> --name=<PIN_NAME>
```

## Testing Actions locally

Note: _npm caching turned off_

```bash
# CI
act -j unit

# Local run of scheduled scrape job
act -j scrape --secret-file SCRAPE.secrets
```

## Monitoring actions' commits

Check the git logs for frequency of scrape action commits: i.e. number of commit per day

```bash
npm run git_log 
## equivalent to:
git log|grep 'Latest book data' | cut -c22-31 | uniq -c |head -n 10
```

## Development

Scrape action is equivalent to:

```bash
# scrape (deno)
. GOODREADS.env
deno run -q --allow-read --allow-write --allow-run --allow-net --allow-env --unstable src/scrape.js
# pin to ipfs (node)
. WEB3STORAGE.env
npm start
```

## Validating with `cue`

```bash
(cd cue; cue fmt)
(cd cue; cue vet check-output.cue ../goodreads-rss.json)

# rss output (per page)
# all at once
(cd cue; cue vet check-rss.cue ../data/rss-json/goodreads-rss-p*.json)
# invoke per page
(cd cue; for i in ../data/rss-json/goodreads-rss-p*json; do echo $i; cue vet check-rss.cue $i ; done)
```

## References

- [flat-data post](https://next.github.com/projects/flat-data)
- [GitHub Action - Flat Data](https://github.com/marketplace/actions/flat-data)
- [Git scraping: track changes over time by scraping to a Git repository](https://simonwillison.net/2020/Oct/9/git-scraping/)
- [Fire Example](https://github.com/simonw/ca-fires-history)
- [Web3.storage pinning](https://web3.storage/docs/how-tos/pinning-services-api/)
- [we3.storage: ipfs-car](https://github.com/web3-storage/ipfs-car)
