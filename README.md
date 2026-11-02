# scrobble-books-data

[![CI - lint and unit tests](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml/badge.svg?branch=main)](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml)

Tracking reading data

This repo archives the latest version of my reading data, scraped from Goodreads
by a GitHub Actions workflow that commits the results back to `main`.

Scraping is paused: Goodreads retired the RSS feed (404 since 2026-10-28), so
the data is frozen as of 2026-10-27. A replacement scraper is in progress
([#23](https://github.com/daneroo/scrobble-books-data/issues/23)).

Browse the data in the browser (flatgithub.com is gone):

- [Datasette Lite: goodreads-rss.json](https://lite.datasette.io/?json=https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json)
  — browse, facet, SQL

## Published files

At the repo root, fetched externally from raw.githubusercontent.com:

- [`goodreads-rss.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json)
  — read by the scrobbleCast site; its path and shape must not change
- [`goodreads-rss-ng.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng.json)
- [`goodreads-rss-ng-progress.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng-progress.json)
- [`goodreads-rss-2026-10-27T20.19Z.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-2026-10-27T20.19Z.json)
  — reference copy of the last good `goodreads-rss.json` (from `bb27463ed`,
  still current at the last successful run, 2026-10-27T20:19Z), byte-identical;
  the new scraper is compared against it

## Layout

A bun workspace.

- `apps/` — scrapers, all read-only references now that the RSS feed is gone:
  - `scrape-deno` — the original deno RSS scraper (written for githubocto/flat,
    which used Deno as its post-processor); wrote `goodreads-rss.json`
  - `scrape-ng` — the bun RSS scraper; wrote the two `-ng` files
  - `scrape-browser` — an early Playwright prototype
- `cue/` — the CUE schema for the published files (`check-output.cue`), with
  example files
- `.github/workflows/` — `scrape.yml` (scrape and commit, manual-only while
  paused), `unit.yml` (CI: `bun run ci`)
- `thoughts/BACKLOG.md` — idea inbox
- `docs/` — lasting reference (agent docs)

The old scrapers are outside the workspace and excluded from the `ci` gate.

## Usage

```bash
bun install
bun run ci       # the gate: format check, ESLint, markdownlint, tsc, bun test, CUE
bun run fmt      # fix formatting when ci fails
bun run outdated # dependency updates (bun run outdated:fix to apply)
bun run git:log  # scrape commits per day
```

Prettier and the linters skip the vendored agent skills, the published data
files and the old scrapers.

## Testing GitHub Actions locally

With [act](https://github.com/nektos/act) and Docker:

```bash
bun run act:unit   # act -j unit --container-architecture linux/amd64
bun run act:scrape # adds --secret-file secrets/GITHUB.env; never commits
```

The scrape workflow's commit step is guarded by `!env.ACT`, so a local run never
commits.

## Monitoring actions' commits

Check the git logs for frequency of scrape action commits: i.e. number of commit
per day

```bash
bun run git:log
## equivalent to:
git log | grep 'Latest book data' | cut -c22-31 | uniq -c | head -n 10
```

## Validating with `cue`

`bun run cue` vets the example files; to vet the published file:

```bash
(cd cue; cue fmt)
(cd cue; cue vet check-output.cue ../goodreads-rss.json)
```

## References

- [flat-data post](https://next.github.com/projects/flat-data)
- [GitHub Action - Flat Data](https://github.com/marketplace/actions/flat-data)
- [Git scraping: track changes over time by scraping to a Git repository](https://simonwillison.net/2020/Oct/9/git-scraping/)
- [Fire Example](https://github.com/simonw/ca-fires-history)
