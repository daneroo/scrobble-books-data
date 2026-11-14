# BACKLOG

Ideas that no ticket covers. Anything a ticket covers lives in the ticket, not
here. Promote an idea to a GitHub issue, then delete the line.

- [ ] canonical-data-split — research the eventual shape of the canonical data:
      one `goodreads.json`, vs. separate book, user and progress files, vs. one
      file per book; file format (e.g. CBOR); dropping unused fields.
- [ ] consumers — the scrobbleCast site: use fractional ratings and progress
      from `goodreads.json`; handle the `did-not-finish` shelf.
- [ ] shelves — non-exclusive shelves: store every shelf of a book as a list in
      `goodreads.json`, with each shelf's semantics (exclusive or not); until
      then a book on a non-exclusive shelf fails the run (#29).

## #23 carryover: input for the wayfinder map (temporary)

Everything left unfinished under #23 (its body, #33, #34 and the closed tickets'
open steps) plus ideas from 2026-11-02 to 2026-11-14. Collected, not sorted or
decided. **The wayfinder charting starts from this list: every line lands on the
map as a ticket, a "Not yet specified" note or an "Out of scope" note.** Then
#23, #33 and #34 are closed, pointing at the map, and this section is deleted.

`#34/c<id>` is comment `<id>` on #34:
`https://github.com/daneroo/scrobble-books-data/issues/34#issuecomment-<id>`.

### #34 acceptance criteria (none done)

- [ ] list every #23 decision: what, where, who (user or agent), code, test
- [ ] the user re-judges each decision (keep, change, drop); a test per change
- [ ] a rerunnable script compares `goodreads-rss.json` with the reference,
      every book, every one of the 19 fields
- [ ] every difference listed per book and field, justified, user-approved
- [ ] every `goodreads.json` field justified: source, format, why it exists
- [ ] dates (`userDateAdded`, `userDateCreated`) checked once by hand through
      GraphQL, never part of the scrape

### #34 comments ("also review")

- [ ] the saved browser profile, added outside the spec (#34/c6569897887)
- [ ] sidebar All (1508) vs 1450 listed; top-level `userFullName`
      (#34/c6572652846)
- [ ] every number an agent picked: where from, what calibration says
      (#34/c6573269398); every run-forever guard and its overlaps
      (#34/c6592091697)
- [ ] saved raw pages (~700 MB/run): `--save-pages`, `--quiet` (#34/c6573321735,
      c6573342655)
- [ ] the user's critique: too complex vs the old scrapers; the mapping should
      be central; invented fields; start from the old behaviour
      (#34/c6573594946); size and machinery split (#34/c6575522395)
- [ ] `--cached`: "likely remove" (#34/c6574480783), but `bun run publish`
      restarts now depend on it
- [ ] file names: `goodreads.json` vs `goodreads-rss.json`; CUE file names
      (#34/c6574886102)
- [ ] book order (list vs "last updated"); books shelved as two editions count
      reads twice; The Iliad's duplicate events (#34/c6574999561)
- [ ] `sort=date_updated`: a mid-run update fails the run; how often?
      (#34/c6575187555)
- [ ] intel for the restart: data, sources per field, access, process lessons
      (#34/c6575628267)
- [ ] ETag / `If-None-Match` (#34/c6576876927): since tested, not promising
      (bodies differ per request, full 200 on a match); record the result
- [ ] dates shown as US Pacific days; `--interactive` semantics
      (#34/c6576979001)
- [ ] `userDateAdded`: review-page date vs a timeline rule (#34/c6577079657)
- [ ] how dates are stored and compared: "completely inadequate"
      (#34/c6577347672)
- [ ] the comparison, difference by difference: `bookDescription` (25) open;
      edition vs work `averageRating`; compare `description` at all?;
      title-based pairing; unmapped `goodreads.json` fields unchecked
      (#34/c6579604012)
- [ ] prove each date field's meaning with a test book changed step by step
      (#34/c6579791787)
- [ ] WAF findings (#34/c6589362734)

### #33 (cutover cleanup, none done)

- [ ] delete scrape-deno, scrape-ng, apps/scrape-browser and their gate
      exclusions; the `-ng` output files; deno/pnpm/RSS mentions in docs
- [ ] conflict: #33 deletes the `explore/scrape-browser` branch; the user later
      said never delete it
- [ ] also: `scrape.yml` (old scrape, disabled) and the `GOODREADS_KEY` secret
      (RSS)

### #23 and closed tickets: open steps

- [ ] the runner: #23 planned GitHub Actions 4×/day; #32 is a placeholder "until
      a runner is chosen" (manual publish + staleness check)
- [ ] hand check of 3 books (The Tainted Cup, Debt, Essentialism) (#30, last
      comment)
- [ ] scrobbleCast detail pages: a question left open with the user (#32, last
      comment)
- [ ] calibration runs (#26): partly done, `docs/scrape-stability.md`
- [ ] GLOSSARY terms #23 named (list page, review page, exclusive shelf,
      timeline, segment, reference, compatibility mapping); hosting ADR
- [ ] temporary files from #23: `thoughts/field-sources.md`,
      `thoughts/robustness-criteria.md`
- [ ] #23's spec itself: problem, user stories, decisions (input to the #34
      decision list)
- [ ] a spam comment on #23 (an ad): delete

### Since 2026-11-02 (sessions; `docs/scrape-stability.md`)

- [ ] WAF: trigger unknown; the 5-minute pattern (AWS default 300 s immunity)
      untested; only `Cookie` and `User-Agent` are sent, no other browser
      headers
- [ ] WAF recovery inside the scraper: on a 202 (or before 5 min), renew the
      `aws-waf-token` in the browser and continue; watch a renewal right after a
      challenge
- [ ] review-page timeout: 15 s vs ~5 s (the slow tail is bimodal)
- [ ] interleave book and review pages; fetch book pages signed out (public,
      `max-age=86400`)
- [ ] split runs: list + review pages (the user's data, never challenged) often;
      book pages (public, challenged) rarely
- [ ] incremental run (list pages, then only books that moved up the "last
      updated" order) + a periodic full run; prove it by comparing consecutive
      full runs over days
- [ ] book descriptions change on their own (Dominion, The Change I Believe In)
- [ ] runner: "moving to docker/cron, as soon as we can figure out how to
      --interactive from inside a container, or alternative"
- [ ] `--interactive` becomes a login-only command (perhaps renamed)
- [ ] the publish loop "should really be in the scraper (ts)"
- [ ] restructure (user, 2026-11-03): define correctness and a rigorous mapping;
      separate list, book, review (progress, state), in that order; maybe split
      book / user data / progress; hash/ETag. Overlaps canonical-data-split
      above
- [ ] login diagnostics (2026-11-03): check real logs for when they fired
- [ ] staleness: GitHub runs it ~2×/day, not 4; the email alert works
      (2026-11-12)
