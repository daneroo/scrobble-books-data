# scrobble-books-data

[![CI - lint and unit tests](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml/badge.svg?branch=main)](https://github.com/daneroo/scrobble-books-data/actions/workflows/unit.yml)

Tracking reading data

This repo archives the latest version of my reading data, scraped from Goodreads
and committed to `main`.

Goodreads retired the RSS feed (404 since 2026-10-28) and shows GitHub's servers
a captcha, so the new scraper (`apps/scrape`) ran by hand on my Mac.

**Where we are (2026-11-14):** the last publish was 2026-11-14T23:42Z
(`952ab52ff`). The data on `main` is frozen from then until the new scraper
([#36](https://github.com/daneroo/scrobble-books-data/issues/36)) replaces it.
`scrape-staleness.yml` fails when `goodreads.json` or `goodreads-rss.json`
hasn't been committed in 48 hours, so it fails from 2026-11-16 until it is
changed.

Browse the data in the browser (flatgithub.com is gone):

- [Datasette Lite: goodreads-rss.json](https://lite.datasette.io/?json=https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json)
  — browse, facet, SQL

## Published files

At the repo root, fetched externally from raw.githubusercontent.com, all frozen:

- [`goodreads.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads.json)
  — the new file: every book, its list-page fields and its reading timeline.
  Last written 2026-11-14T23:42Z.
- [`goodreads-rss.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss.json)
  — historical, in the old RSS format, mapped from `goodreads.json`; still read
  by the scrobbleCast site, so its path and shape must not change until
  scrobbleCast reads `goodreads.json`. Last written 2026-11-14T23:42Z.
- [`goodreads-rss-ng.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng.json),
  [`goodreads-rss-ng-progress.json`](https://raw.githubusercontent.com/daneroo/scrobble-books-data/main/goodreads-rss-ng-progress.json)
  — the old bun RSS scraper's output, last written 2026-10-27.

## Layout

A bun workspace.

- `apps/` — scrapers:
  - `scrape` — the new logged-in scraper
  - the rest are read-only references now that the RSS feed is gone:
    - `scrape-deno` — the original deno RSS scraper (written for
      githubocto/flat, which used Deno as its post-processor); wrote
      `goodreads-rss.json`
    - `scrape-ng` — the bun RSS scraper; wrote the two `-ng` files
    - `scrape-browser` — an early Playwright prototype
- `cue/` — the CUE schema for the published files (`check-output.cue`), with
  example files
- `.github/workflows/` — `scrape-staleness.yml` (fails when the published data
  is over 48 hours old), `scrape.yml` (old RSS scrape, disabled), `unit.yml`
  (CI: `bun run ci`)
- `thoughts/BACKLOG.md` — idea inbox
- `docs/` — lasting reference (agent docs)

The old scrapers are outside the workspace and excluded from the `ci` gate.

## Usage

Publishing has stopped (see Where we are). Until then it ran by hand:

```bash
bun run publish                  # scrape until a run passes, commit, push
bun run publish -c 3 --rate 2.2  # options pass through (defaults: -c 3 --rate 6)
bun run publish --interactive    # sign in by hand first
```

```bash
bun install
bun run ci       # the gate: format check, ESLint, markdownlint, tsc, bun test, CUE
bun run fmt      # fix formatting when ci fails
bun run outdated # dependency updates (bun run outdated:fix to apply)
bun run git:log  # scrape commits per day

bun run scrape --help  # the new scraper: the single entry point
```

Prettier and the linters skip the vendored agent skills, the published data
files and the old scrapers.

## Testing GitHub Actions locally

With [act](https://github.com/nektos/act) and Docker:

```bash
bun run act:unit # act -j unit --container-architecture linux/amd64
```

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
