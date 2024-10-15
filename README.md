# scrobble-books-data

[![CI - lint and unit tests](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml/badge.svg?branch=main)](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml)

Tracking reading data

This repo archives the latest version of my reading data every 20 minutes.

You can look at the formatted data as tables here:

- <https://flatgithub.com/daneroo/scrobble-books-data?filename=goodreads-rss.json&tab=items>
- <https://flatgithub.com/daneroo/scrobble-books-data?filename=goodreads-rss-ng.json&tab=items>
- <https://flatgithub.com/daneroo/scrobble-books-data?filename=goodreads-rss-ng-progress.json&tab=items>

## TODO

This is a great place to test migrating to deno workspaces

- [ ] remove bun
- [ ] replace  `pnpm -r ...`
  - [ ] remove pnpm if possible
- [ ] replace/validate "deps:update" for deno
- _______________ Older _______________
- [ ] scrape-ng progress (only for currently-reading)
- [ ] Problem with act -j (scrape|unit)
- [ ] Re-implement apps/pin to use w3.storage (new)
  - <https://web3.storage/docs/w3up-client/>
  - pnpm i @web3-storage/w3up-client
- [ ] Use CBOR instead of files?
- Clean up the data more
  - Removed unused fields (description, etc)

## Description

Performs 2 tasks as a cron trigger github action:

- scrape latest reading data (goodreads)
  - [`goodreads-rss.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json)
  - [`goodreads-rss-ng.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng.json)
  - [`goodreads-rss-ng-progress.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng-progress.json)
- pins the the file to web3.storage (ipfs)
  - [`goodreads-ipfs.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-ipfs.json) contains the pinned CID
- commits any changes back to the repo

The scraper was originally written with `deno` because we were using
githubocto/flat@v3, which uses Deno/Typescript as it's post-processor.

The pinning code was moved back to node, because the web3.storage client is unstable/broken with npm imports

Pinning should move to my own ipfs-cluster soon, RIGHT?

## Usage

The data files ca be fetched (externally) at

- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json>
- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng.json>
- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng-progress.json>
- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-ipfs.json>

The pinned CID's can be found at (requires login)

- [web3.storage console (books space - by DID)](https://console.web3.storage/space/did:key:z6MkmwcwCLmuTxY6mWhh9BVmj8t7EZ2rjKtc7cTVYhjN77jq)

Uses `pnpm` for orchestration, including for deno and github actions.

```bash
pnpm test
pnpm lint
pnpm deps:check
pnpm deps:update
pnpm act:unit
pnpm act:scrape
pnpm git:log
```

### Development

```bash
# scrape (deno)
# export vars from secrets/GOODREADS.env
set -a && source secrets/GOODREADS.env && set +a
deno run -q --allow-read=. --allow-write=. --allow-run --allow-net --allow-env apps/scrape/src/scrape.js

# scrape-ng (bun)
# export vars from secrets/GOODREADS.env
set -a && source secrets/GOODREADS.env && set +a
bun apps/scrape-ng/src/index.ts # --flags!!!!

# scrape-browser (bun) - deprecated
# export vars from secrets/GOODREADS.env
set -a && source secrets/GOODREADS.env && set +a
bun apps/scrape-browser/src/index.ts # --flags!!!!

# pin to ipfs (sh)
# references secrets/WEB3STORAGE.env
docker compose -f apps/pin-sh/compose.yaml run --rm -it upload-to-web3storage
# to force rebuild
docker compose -f apps/pin-sh/compose.yaml build # --no-cache to really force rebuild

# Deprecated 'till rewritten
# pin to ipfs (node) - disabled for now
# export vars from secrets/WEB3STORAGE.env
set -a && source secrets/WEB3STORAGE.env && set +a
node apps/pin/src/pin.js
```

### Dependency management

Uses `npm-check-updates / ncu` for node, and `https://deno.land/x/udd/main.ts` for deno.

```bash
pnpm run deps:check
pnpm run deps:update
```

## Testing GitHub Actions locally

Note: _npm caching turned off_

```bash
pnpm act:unit
pnpm act:scrape
```

Equivalent to:

```bash
# CI/unit tests
act -j unit
act -j unit --container-architecture linux/amd64

# Local run of scheduled scrape job
act -j scrape --secret-file secrets/GITHUB.env
act -j scrape --secret-file secrets/GITHUB.env --container-architecture linux/amd64
```

## Monitoring actions' commits

Check the git logs for frequency of scrape action commits: i.e. number of commit
per day

```bash
pnpm git:log
## equivalent to:
git log|grep 'Latest book data' | cut -c22-31 | uniq -c |head -n 10
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

## Upstream PR for setup-cue

- <https://github.com/cue-lang/setup-cue/pull/10>
- I am currently using my own fork (pinned to main)

## References

- [flat-data post](https://next.github.com/projects/flat-data)
- [GitHub Action - Flat Data](https://github.com/marketplace/actions/flat-data)
- [Git scraping: track changes over time by scraping to a Git repository](https://simonwillison.net/2020/Oct/9/git-scraping/)
- [Fire Example](https://github.com/simonw/ca-fires-history)
- [Web3.storage pinning](https://web3.storage/docs/how-tos/pinning-services-api/)
- [we3.storage: ipfs-car](https://github.com/web3-storage/ipfs-car)
