# BACKLOG

Idea inbox, grouped by theme: snippets worth not forgetting, not yet worth an
issue. Promote to a GitHub issue, then delete the line.

## From #23 (deliberately out of scope)

- [ ] canonical-data-split — research how the canonical data should eventually
      be shaped: one `goodreads.json`, vs. separate book, user and progress
      files, vs. one file per book. Out of the port in #23.
- [ ] per-file-viewer-links — a Datasette Lite link for each published file,
      plus a DuckDB ([shell.duckdb.org](https://shell.duckdb.org/)) query, once
      the new output files exist (the README links only `goodreads-rss.json`
      today; #32 adds the rest).
- [ ] fractional-ratings-in-consumers — the scrobbleCast site reads integer
      `userRating` strings from `goodreads-rss.json`; using fractional ratings
      (and progress) from `goodreads.json` there is a consumer change, out of
      scope for #23.
- [ ] per-page-cue — vet each segment (one file per list page) on its own, so a
      CUE failure names the page; the old README looped `cue vet` per page for
      the same reason (`for i in ../data/rss-json/goodreads-rss-p*json; do …`).

## From the README TODO list (moved 2026-11-01)

- [ ] bun workspace - remove deno (#24, #33)
  - [ ] consolidate on the bun scraper (`apps/scrape-ng`): retire deno
        `apps/scrape`, `goodreads-rss.json` and `check-rss.cue` — superseded by
        #23: deno is now `apps/scrape-deno` (removed in #33), `check-rss.cue` is
        gone (#24), and `goodreads-rss.json` stays as the compatibility output
  - [x] verify deps:check, deps:update — replaced by `bun run outdated` /
        `outdated:fix` (#24)
- [ ] AGENTS: thoughts and docs
- [ ] scrape-ng progress (only for currently-reading?)
  - [ ] augment schema for progress
  - [ ] validate and redeploy associated app scrobbleCast/site
- [ ] Fractional user ratings (Goodreads allows .25 steps since 2026-10)
  - [x] cue: `user_rating` / `#UserRating` accept decimals (`4.5`, `4.25`,
        `4.50`)
  - [ ] find a source: RSS `user_rating` is integer-only (4.5 -> `4`)
    - first known instance: _Time Travel: A History_ (James Gleick) - bookId
      28587584, review 9047081205
    - logged-in book page shows "Your rating: 4.50"
    - unauthenticated `review/show/<id>` now redirects to sign-in
  - [ ] once sourced: zod / `RSSItem` types, and consumers (scrobbleCast/site)
- [ ] Account for the `did-not-finish` shelf
  - cue `#Shelves` already allows it; scrape-ng `Shelf` type does not
  - no items on that shelf yet - verify how it appears in RSS `user_shelves`,
    and in consumers (scrobbleCast/site)
- Older
  - [ ] Problem with act -j (scrape|unit)
  - [ ] Use CBOR instead of files?
  - Clean up the data more
    - Removed unused fields (description, etc)
