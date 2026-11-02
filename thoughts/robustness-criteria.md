# Robustness criteria from scrape-deno and scrape-ng (#26)

Temporary. Once approved, these criteria become tests (#27 onward) and this file
is deleted.

**Sources**, line numbers as of `8c2dd1373`:

- `deno`: `apps/scrape-deno/src/` (`scrape.js`, `fetcherXML.ts`)
- `ng`: `apps/scrape-ng/src/`; paths below are relative to it
- `wf`: `.github/workflows/scrape.yml`
- **reference copy**: `goodreads-rss-ng-2026-10-27T15.37Z.json`, byte-identical
  to `bb27463ed:goodreads-rss-ng.json` (1447 books; its first 1400 equal the
  last good `goodreads-rss.json`); not to be confused with the reference
  _scrapers_ above

**Format.** One bullet per criterion: **ID · verdict**, the criterion for the
new scraper, then _Was_ (what the old code did, with its source) and _Why_.

**Verdicts** are about the old behaviour:

- **keep**: it carries over
- **change**: it carries over, modified
- **drop**: it was a flaw; the criterion states what replaces it
- **new**: neither reference did it
- **deferred**: out of #23's scope (no workflow, no commit to `main`); kept for
  the later ticket that runs the scrape on a schedule

## What the data history shows

The commit history of the published files is the best evidence of what worked.

- **E1. deno published partial data 93 times**, from 2022-05-31 to 2024-09-21:
  - Whole pages went missing. For example, `3050b03e9` (2024-09-19) went from
    800 items to 200.
  - The cause: a non-200 page ended the loop, and the partial feed was written
    with exit 0.
  - No drops since retries with linear backoff landed (`fbf928ee6` and
    `bba35354f`, 2024-09-21).
  - So retries and pacing made deno reliable; its error handling never did.
- **E2. `goodreads-rss-ng.json` was truncated for almost 11 months:**
  - On 2025-05-14 (`deb4a857c`), page 1 came back with 99 rows. ng's "a short
    page is the last page" rule stopped there, and 99 of 1179 items were
    published.
  - The file stayed at 99 items until 2025-12-23, then at 199 until 2026-04-04.
  - Nothing failed.
- **E3. deno has dropped books since 2026-08-17** (`8e6cb9731`):
  - Its loop stops after page 14 (`scrape.js:29`), so `goodreads-rss.json` is
    stuck at 1400 items while the shelf grew to 1447.
  - The 47 oldest-added books (2011-11-10 to 2013-01-16) were published before
    then and are now gone.
- **E4. `goodreads-rss-ng-progress.json` has said every book is "read" since
  2026-02-05:**
  - The shelf selector (`goodreads/fetchReadingProgress.ts:128`) stopped
    matching. The empty result was joined to `""`, which means "read".
  - All 1447 items say so, against 446 to-read, 209 on-deck and 8
    currently-reading in `goodreads-rss-ng.json`.
  - Nothing failed.

## Retries and backoff

- **R1 · keep.** Temporary errors are retried, with a growing delay before each
  retry.
  - _Was:_ deno, linear: 1 s, 2 s, … (`fetcherXML.ts:9-21`).
  - _Why:_ it ended E1.
- **R2 · change.** Only temporary errors are retried: timeout, network error
  (reset, DNS), 5xx, 429. Anything else is fatal at once.
  - _Was:_ deno retried every non-200 (`fetcherXML.ts:16`); ng every non-ok
    (`goodreads/fetchHelpers.ts:21`).
  - _Why:_ retrying a redirect to sign-in, a 404 or a 202 WAF challenge hides
    the cause and keeps hitting the WAF. Network errors aren't in #23's retried
    list yet; they're proposed here.
- **R3 · change.** At most 4 attempts per request; backoff 2 s, 4 s, 8 s, each
  ±25% jitter.
  - _Was:_ deno 15 attempts, up to 120 s per page (`fetcherXML.ts:7`); ng 5
    attempts (`goodreads/rss.ts:93`, `goodreads/fetchReadingProgress.ts:112`)
    with no delay (`goodreads/fetchHelpers.ts:83-91`).
  - _Why:_ the prototype saw ~1% timeouts, all fine on the first retry. 15
    attempts suited a flaky feed, not ~1450 requests. No delay is a hammer.
- **R4 · new.** A `Retry-After` on 429 or 503 is honoured up to 60 s; longer
  fails the run as `throttled`.
  - _Why:_ Goodreads says how long to wait; longer than a minute means stop.
- **R5 · new.** Retry budget: more than 20 retries in a run, or 5 temporary
  failures in a row, fails the run as `throttled`. Numbers to calibrate.
  - _Why:_ many retries mean throttling; pushing on risks a WAF block of the
    account or IP.
- **R6 · keep.** Every retry is logged: URL path, attempt, status or error,
  delay.
  - _Was:_ deno `fetcherXML.ts:13,17`; ng `goodreads/fetchHelpers.ts:87`.

## Timeouts and cancellation

- **T1 · change.** Every request has a timeout that aborts it (`AbortSignal`),
  covering the body as well as the headers.
  - _Was:_ deno, no timeout at all. ng raced a timer
    (`goodreads/fetchHelpers.ts:30-44`), so a timed-out fetch kept running and
    the timer was never cleared. A comment blames a 2024 bun bug for not using
    abort (`goodreads/fetchHelpers.ts:1-3`).
  - _Why:_ requests left running are a likely cause of the hang ng worked around
    with a forced `process.exit(0)` (`index.ts:64-72`).
- **T2 · change.** Timeouts per page type: list page 30 s, review page 15 s,
  then set at about 3 × p99 by calibration.
  - _Was:_ ng list 5 s (`goodreads/rss.ts:92`), review 2 s "tested optimal"
    (`goodreads/fetchReadingProgress.ts:111`).
  - _Why:_ those were tuned for RSS and logged-out pages. A logged-in list page
    of 100 rows is heavier.
- **T3 · new.** A 30 min deadline for the whole run, in the scraper.
  - _Was:_ deno and ng had none; `wf` relied on the job's 6 h default.
- **T4 · new.** On the first fatal error: abort every request in flight, clear
  the queue, exit non-zero. The process exits on its own: no forced exit, no
  pending timers.
  - _Was:_ ng `Promise.all` over `p-limit`
    (`goodreads/fetchReadingProgress.ts:44-52`) lets queued tasks run after a
    rejection.
- **T5 · deferred.** The scrape workflow has a `concurrency:` group, so two runs
  never overlap.
  - _Was:_ `wf` has none.

## Pacing and concurrency

- **P1 · change.** One flow controller for every request after login, list and
  review pages alike (#23).
  - _Was:_ ng fetched list pages one at a time (`goodreads/rss.ts:33-45`) and
    used `p-limit` only for review pages.
- **P2 · change.** A concurrency limit (max requests in flight), set from the
  CLI or the environment.
  - _Was:_ ng `p-limit`, CLI `-c` only, default 3 (`index.ts:96,115-117`).
- **P3 · change.** Concurrency `1` is strictly sequential, through the same code
  path.
  - _Was:_ ng kept a separate sequential loop
    (`goodreads/fetchReadingProgress.ts:35-42,55-56`).
  - _Why:_ the same fallback, without a second implementation to keep in sync.
- **P4 · change.** A rate cap (a minimum interval between request starts), from
  the CLI or the environment.
  - _Was:_ deno slept ≥ 1 s before every request (`fetcherXML.ts:11-12`); ng had
    no cap.
  - _Why:_ deno's pacing is part of what made it reliable. Concurrency alone
    doesn't bound the rate when pages are fast.
- **P5 · keep.** The log shows per-request time, and per batch the elapsed time
  and achieved rate.
  - _Was:_ ng `timeOne`, `timeMany` (`goodreads/timeHelpers.ts`).
  - _Why:_ calibration is read from it.
- **P6 · keep.** Results come back in input order, whatever order they complete
  in.
  - _Was:_ ng `Promise.all`.
- **P7 · new.** Requests after login send the login browser's User-Agent.
  - _Why:_ a bun User-Agent alongside a Chrome session cookie is an easy bot
    signal.

## Completeness

- **C1 · drop.** The number of list pages comes from the sidebar counts
  (`ceil(total / 100)`).
  - _Was:_ deno: a fixed cap of 14 pages, stopping early on an empty or
    unparsable page (`scrape.js:29,55-64`).
  - _Why:_ E1, E3.
- **C2 · drop.** Every page but the last has exactly 100 rows, or the run fails
  as `page-size`.
  - _Was:_ ng treated a short page as the last one (`goodreads/rss.ts:58-65`).
  - _Why:_ E2.
- **C3 · new.** The count of unique `bookId`s per shelf equals the sidebar
  count, and the total equals their sum (#23). No `bookId` appears twice;
  otherwise `duplicate-book`.
  - _Why:_ catches pages that shift during a run.
- **C4 · drop.** Every review page yields exactly one exclusive shelf, equal to
  the list page's.
  - _Was:_ ng skipped items without a review id
    (`goodreads/fetchReadingProgress.ts:76-80`) and accepted no shelves at all
    (`:128-132`).
  - _Why:_ E4.
- **C5 · drop.** Zero books fails the run as `empty-run`.
  - _Was:_ deno took it as "no more entries" (`scrape.js:55-58`).
  - _Why:_ an empty shelf is far likelier to be a broken scrape.
- **C6 · new.** Until cutover, a migration check only: every `bookId` in the
  reference copy must be present, with zero tolerance and no override. Any
  missing one fails the run as `unexpected-shrink`, listing each missing book
  (`bookId`, title).
  - _Why:_ a second guard, independent of the sidebar (E1, E2, E3).
  - **Deferred:** the ongoing check, against the last published
    `goodreads.json`, goes to a later ticket after #23, like T5.
- **C7 · change.** Dev limits (`--pages`, `--items`) never write the published
  files; such a run ends as `limited-run`.
  - _Was:_ ng `-p` and `-n` wrote to the normal output path
    (`index.ts:107-114`).

## Error handling and exit codes

- **X1 · drop.** Any failure exits non-zero with a named failure mode.
  - _Was:_ ng caught everything and exited 0 (`index.ts:53-59,72`); deno caught
    parse errors and wrote the partial feed (`scrape.js:60-64`).
  - _Why:_ E1, E2, E4. The old scrapers' central flaw.
- **X2 · new.** A failure writes no published file: outputs go to temp files,
  moved into place only after every check passes.
  - _Why:_ a failed run leaves the last good outputs untouched.
- **X3 · keep.** Raw pages and per-page parsed files go to `data/` (gitignored),
  on success and on failure. They are never committed (the repo is public).
  - _Was:_ deno `scrape.js:32-44`; ng `goodreads/rss.ts:107-129`.
- **X4 · drop.** Logs never contain secrets: no cookie, password or email; URLs
  are logged as a path only.
  - _Was:_ deno logged the URL with `?key=` (`fetcherXML.ts:5`); ng put it in
    error messages (`goodreads/fetchHelpers.ts:23,38`).
  - _Why:_ the old RSS key was printed in public Actions logs.
- **X5 · change.** CUE on the segments, `goodreads.json` and
  `goodreads-rss.json` (#23) must pass before the outputs are moved into place
  (X2).
  - _Was:_ `wf` ran CUE as a step before the commit step ("Validate Output with
    CUE w/ng", `scrape.yml:57-63`). That gate worked; the scrapers' exit 0
    defeated it.
- **X6 · drop.** `bun run ci` fails when a test fails, and tests make no network
  calls.
  - _Was:_ ng `"test": "bun test || true"`; `goodreads/fetchHelpers.test.ts`
    calls httpbin.org.
- **X7 · change.** Settings are checked before any request: missing secrets fail
  as `missing-credentials`, and a malformed number for concurrency or rate fails
  as `bad-config`.
  - _Was:_ deno threw on missing env (`scrape.js:14-18`), exit non-zero. ng
    threw into its catch-all (`index.ts:173-186`), exit 0. ng's `parseInt` on
    `-c`, `-n`, `-p` was unchecked (`index.ts:107-117`).

## Parsing, schema and types

- **S1 · change.** Each page is validated with zod as it is parsed; a failure
  names the page and the row.
  - _Was:_ ng validated each page (`goodreads/rss.ts:119`,
    `goodreads/xml/validateXML.ts`) but threw the bare zod error, with no page.
- **S2 · drop.** A missing required field fails parsing. `""` is written only
  where the source is truly empty.
  - _Was:_ deno `?? ""` on every field (`scrape.js:117-126`).
  - _Why:_ silent blanks are E4 in another form.
- **S3 · drop.** On a signed-in 200 page, a selector that matches nothing fails
  as `layout-change`, never yields an empty value.
  - _Was:_ ng shelves (`goodreads/fetchReadingProgress.ts:128-132`).
  - _Why:_ E4.
- **S4 · keep.** Values stay strings as found, with no number conversion, and
  are trimmed as in the reference copy.
  - _Was:_ ng `parseTagValue: false`, `trimValues`
    (`goodreads/xml/parseXML.ts:28-31`); explicit trims
    (`goodreads/xml/mapFields.ts:25-46`).
  - _Why:_ ISBNs and ids keep their leading zeros.
- **S5 · change.** A non-empty date or number that doesn't parse fails parsing.
  `""` and `"0"` remain the compatibility forms of _empty_ only.
  - _Was:_ `safeDate` gave `""` and `safeIntAsString` gave `"0"` for anything
    unreadable (deno `scrape.js:105-126`; ng
    `goodreads/xml/mapFields.ts:61-91`).
- **S6 · drop.** A timeline row with no date keeps no date.
  - _Was:_ ng invented "January 1, 1970"
    (`goodreads/fetchReadingProgress.ts:158-160`).
  - _Why:_ #23 stores the timeline raw.
- **S7 · keep.** The compatibility mapping rounds `averageRating` with
  `toFixed(1)`, and makes the same replacement in `description`.
  - _Was:_ deno `scrape.js:133-149`; ng `goodreads/xml/mapFields.ts:105-133`.
  - _Why:_ both did it to cut commit noise, and the reference copy has it.
- **S8 · keep.** Output is deterministic: the same Goodreads data gives a
  byte-identical file (no timestamps, stable order, 2-space JSON). The order is
  the list order (`date_added` descending), as in the reference copy.
  - _Was:_ deno left out `lastBuildDate` (`scrape.js:24`); S7.
  - _Why:_ no diff when nothing changed.
- **S9 · change.** The feed `title` is a constant, taken from the reference
  copy.
  - _Was:_ deno took it from every page (`scrape.js:51`); ng warned if it
    changed (`goodreads/rss.ts:46-53`).
  - _Why:_ there's no RSS channel any more.
- **S10 · change.** TypeScript types are inferred from the zod schemas.
  - _Was:_ ng wrote `goodreads/types.ts` by hand next to the schema.
  - _Why:_ two definitions drift.
- **S11 · drop.** No derived values: no read count, no shelves joined with
  `", "`.
  - _Was:_ ng `goodreads/fetchReadingProgress.ts:90,173-175`.
  - _Why:_ #23 keeps the timeline raw; interpreting it is out of scope.

## Proposed additions to #23's fail-closed list

Each stops the run, exits non-zero and writes nothing: `throttled` (R4, R5),
`run-timeout` (T3), `page-size` (C2), `duplicate-book` (C3), `layout-change`
(S3, C4), `empty-run` (C5), `unexpected-shrink` (C6), `limited-run` (C7),
`missing-credentials` and `bad-config` (X7).

To #23's retried list: network errors (R2).

## Request limits and calibration

**Proposed defaults:**

- Concurrency 2, at most 2 requests/s.
- A run is 15 list pages plus ~1450 review pages, so about 12 minutes.
- That's half the rate the prototype ran at with no 429, 503 or 202 (concurrency
  3, ~4 requests/s, 3 full runs), and twice deno's pace.

**Calibration**, logged in, run locally by you:

1. One full run at each step: (concurrency 1, no cap), (2, 2/s), (3, 3/s). Never
   above 4/s, the highest rate seen so far.
2. For each step, record:
   - the achieved rate;
   - p50, p95 and p99 latency per page type;
   - timeouts and retries;
   - any 429, 503 or 202.
3. A step passes with no 429, 503 or 202, and at most 1% timeouts. The default
   is one step below the fastest passing step. Timeouts follow T2.
4. The results and the chosen limits go on the ticket that builds the flow
   controller, for your approval.
