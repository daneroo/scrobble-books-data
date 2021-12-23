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

- <https://web3.storage/files/>

## TODO

- Use a mono repo ([turborepo](https://turborepo.org/))
  - Move deno source to typescript cli project
- Remove redundant CID's in web3.storage
- Use CBOR instead of files?
- Clean up the data more
  - Removed unused fields (description, etc)
  - Use cuelang validation (perhaps part of e2e tests)
  - [CueBlox](https://www.cueblox.com/): see if it appropriate to use
- ~~Done~~
- ~~[Integrate VSCode](https://deno.land/manual@v1.14.1/vscode_deno)~~
- ~~Use [Skypack's xml2js](https://www.skypack.dev/view/xml2js)~~

## Testing Actions locally

Note: _npm caching turned off_

```bash
# CI
act -j unit

# Local run of scheduled scrape job
act -j scrape --secret-file SCRAPE.secrets
```

Check the git logs for frequency of scrape action commits

```bash
git log|grep -B 2 -i latest|grep '^Date:'|cut -c9-18|uniq -c
```

Scrape action is equivalent to:

```bash
## Which is equivalent to:
# scrape (deno)
. GOODREADS.env
deno run -q --allow-read --allow-write --allow-run --allow-net --allow-env --unstable src/scrape.js
# pin (ipfs)
. WEB3STORAGE.env
npm start
```

## Validating with `cue`

```bash
cd cue

cue fmt
cue vet check-output.cue ../goodreads-rss.json

# xml2js output
cue vet check-xml2js.cue goodreads-rss-p1.deno.json
for i in ../json-deno/goodreads-rss-p*json; do echo $i; cue vet check-xml2js.cue $i ; done
# not sure if this is the same
cue vet check-xml2js.cue ../json-deno/goodreads-rss-p*.json
```

## References

- [flat-data post](https://next.github.com/projects/flat-data)
- [GitHub Action - Flat Data](https://github.com/marketplace/actions/flat-data)
- [Git scraping: track changes over time by scraping to a Git repository](https://simonwillison.net/2020/Oct/9/git-scraping/)
- [Fire Example](https://github.com/simonw/ca-fires-history)
