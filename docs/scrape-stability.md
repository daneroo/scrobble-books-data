# Scrape stability vs speed (preliminary)

A first look, 2026-11-03, at how concurrency (`-c`) and our rate limit
(`--rate`) affect how predictably a full scrape ends successfully. To be updated
when the scraper can do more (e.g. retry in place), if needed.

Terms (rate limit, WAF challenge, attempts): see [GLOSSARY.md](../GLOSSARY.md).

## Method

`bash apps/scrape/waf-experiment.sh -c C --rate R`: attempt 1 is a full publish
(15 list, 1451 review, 1451 book pages, saved session); after a failure it waits
60 s and reruns with `--cached` (only missing pages are fetched). One log per
experiment in `data/logs/`.

## Results

Legend:

- `c`, `rate`: `-c`, `--rate`; `Time`: whole experiment; `#`: attempts
- List, Review, Book: `rate · r1/r2/r3/r4/r5`, the rate per second (fetched
  pages only) and the pages that needed 1, 2, 3, 4, 5 retries

| c   | rate | Time    | #   | List             | Review            | Book             |
| --- | ---- | ------- | --- | ---------------- | ----------------- | ---------------- |
| 1   | 0.5  | 1:49:36 | 5   | 0.22 · 0/0/0/0/0 | 0.45 · 17/0/0/0/0 | 0.49 · 0/0/0/0/0 |
| 2   | 1.5  | 0:37:27 | 2   | 0.44 · 0/0/0/0/0 | 1.39 · 24/1/0/0/0 | 1.4 · 0/0/0/0/0  |
| 3   | 2.2  | 0:25:42 | 2   | 0.60 · 0/0/0/0/0 | 2.08 · 20/0/0/0/0 | 1.95 · 0/0/0/0/0 |
| 4   | 3.0  | 0:19:30 | 2   | 0.79 · 0/0/0/0/0 | 2.86 · 17/0/0/0/0 | 2.6 · 1/0/0/0/0  |
| 10  | 7.5  | 0:07:10 | 1   | 1.42 · 0/0/0/0/0 | 6.93 · 25/0/0/0/0 | 7.27 · 0/0/0/0/0 |

Latency of fetched pages (ms), ~the same at every setting:

| Pages  | p50    | p95    | Slowest |
| ------ | ------ | ------ | ------- |
| list   | ~4,500 | ~5,500 | —       |
| review | ~610   | ~900   | ~2,500  |
| book   | ~1,330 | ~1,700 | ~6,600  |

## Observations

- Only book pages got a WAF challenge (status 202); list and review pages never.
- Every retry was "no response in 15s", almost all on review pages: ~1.3% of
  review requests never answer, then succeed on retry. Answers are fast (slowest
  ~2.5 s), so the 15 s timeout is the real tail.
- Latency is flat from 0.5 to 7.5 requests/s (book p50 was even lower at
  `-c 10`): our load doesn't slow Goodreads.
- Book pages per attempt vary widely at one setting (199–589 at `-c 1`, from
  earlier runs too) and don't shrink steadily with rate (197 and 1253+ at
  `-c 4`; no WAF challenge at all in one full `-c 10` run at ~7 requests/s). The
  trigger looks stochastic; more samples per setting are needed.
- Each `--cached` restart after a 60 s pause got through; its login renews the
  `aws-waf-token`. Whether the wait or the renewal clears the WAF challenge is
  untested.
- The effective rate is the lower of `--rate` and `-c` ÷ page time: list pages
  are always held by `-c`; review and book pages by `--rate` at the settings
  above, chosen at the book ceiling (`-c` ÷ 1.33 s).

## Next

- 4 runs of `-c 3 --rate 2.2`, the likely setting for scheduled runs, to see how
  much attempts and book pages per attempt vary at one setting.
- `-c 6 --rate 4.5`.
- Faster runs by fetching less: an incremental run (list pages, then only the
  books that moved up the "last updated" order) for frequent runs, with a
  periodic full run. Unproven: which actions move a book up must be checked
  first.
