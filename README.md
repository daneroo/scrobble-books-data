# scrobble-books-data

[![CI - lint and unit tests](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml/badge.svg?branch=main)](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml)
[![vr scripts](https://badges.velociraptor.run/flat.svg)](https://velociraptor.run)

Tracking reading data

This repo archives the latest version of my reading data every 20 minutes.

You can look at
[the formatted data table here](https://flatgithub.com/daneroo/scrobble-books-data?filename=goodreads-rss.json&tab=items).

## Description

Performs 2 tasks as a cron trigger github action:

- scrape latest reading data (goodreads)
  - `goodreads-rss.json`
- pins the the file to web3.storage (ipfs)
  - `goodreads-ipfs.json` contains the pinned CID
- commits any changes back to the repo

The scraper was originally written with `deno` because we were using
githubocto/flat@v3, which uses Deno/Typescript as it's post-processor.

## Usage

The data file ca be fetched (externally) at

- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json>.
- <https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-ipfs.json>.

The pinned CID's can be found at

- <https://web3.storage/account/>

Uses `velociraptor` for scripts

```bash
vr # list targets
vr git_log
```

## TODO

- [ ] top level commands: pnpm workspace?
  - [ ] for update dependencies
  - [ ] recursive test/lint/update deps
  - [ ] invoke actions locally (act)
- [ ] Restore cue-lang/setup-cue see note below 
  - My PR is merged, but there has been no new release of setup-cue
- [ ] Rewrite github actions with cue !?
- [ ] Use CBOR instead of files?
- Clean up the data more
  - Removed unused fields (description, etc)


## Testing Actions locally

Note: _npm caching turned off_

```bash
# CI
act -j unit
act -j unit --container-architecture linux/amd64

# Local run of scheduled scrape job
act -j scrape --secret-file SCRAPE.secrets
act -j scrape --secret-file SCRAPE.secrets --container-architecture linux/amd64
```

## Monitoring actions' commits

Check the git logs for frequency of scrape action commits: i.e. number of commit
per day

```bash
# velociraptor
vr git_log
## equivalent to:
git log|grep 'Latest book data' | cut -c22-31 | uniq -c |head -n 10
```

## Development

Scrape action is equivalent to:

```bash
# scrape (deno)
. GOODREADS.env
deno run -q --allow-read=. --allow-write=. --allow-run --allow-net --allow-env --unstable apps/scrape/src/scrape.js
# pin to ipfs (node)
. WEB3STORAGE.env
node apps/pin/src/pin.js
```

### Dependency management

```bash
# velociraptor: using udd (update deno dependencies)
vr udd
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
