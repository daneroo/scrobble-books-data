# scrobble-books-data

[![CI - lint and unit tests](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml/badge.svg?branch=main)](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml)

Tracking reading data

This repo archives the latest version of my reading data every 20 minutes.

You can look at
[the formatted data table here](https://flatgithub.com/daneroo/scrobble-books-data).

## Description

We are using githubocto/flat@v3, which uses Deno/Typescript as it's
postprocessor,

## Usage

The data file ca be fetched (externally) at
<https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json>.

## TODO

- [Publish deno/typescript module with tests](https://www.brunnerliv.io/articles/create-your-first-module-with-deno)
- Ensure no trivial updates (no lastBuildDate from rss pages)
- Clean up the data more
  - Use cuelang validation (perhaps part of e2e tests)
  - [CueBlox](https://www.cueblox.com/): see if it appropriate to use
- ~~Done~~
- ~~[Integrate VSCode](https://deno.land/manual@v1.14.1/vscode_deno)~~
- ~~Use [Skypack's xml2js](https://www.skypack.dev/view/xml2js)~~

## Testing locally

```bash
# CI
act -j unit

# Local run of scheduled scrape job
act -j scrape --secret-file GOODREADS.secrets
# which is equivalent to:
. GOODREADS.env
deno run -q --allow-read --allow-write --allow-run --allow-net --allow-env --unstable src/postprocess.js goodreads-rss-ignore-me-p1.xml
```

## Validating with `cue`

```bash
cd cue
cue fmt check.cue
cue vet check.cue goodreads-rss-p1.deno.json
for i in ../json-deno/goodreads-rss-p*json; do echo $i; cue vet check.cue $i ; done
# not sure if this is the same
cue vet check.cue ../json-deno/goodreads-rss-p*.json
```

## References

- [flat-data post](https://next.github.com/projects/flat-data)
- [GitHub Action - Flat Data](https://github.com/marketplace/actions/flat-data)
- [Git scraping: track changes over time by scraping to a Git repository](https://simonwillison.net/2020/Oct/9/git-scraping/)
- [Fire Example](https://github.com/simonw/ca-fires-history)
