# BACKLOG

Ideas that no ticket covers. Anything a ticket covers lives in the ticket, not
here. Promote an idea to a GitHub issue, then delete the line.

- [ ] canonical-data-split — research the eventual shape of the canonical data:
      one `goodreads.json`, vs. separate book, user and progress files, vs. one
      file per book; file format (e.g. CBOR); dropping unused fields.
- [ ] consumers — the scrobbleCast site: use fractional ratings and progress
      from `goodreads.json`; handle the `did-not-finish` shelf.
- [ ] incremental-scrape — stop a run early once no more entries have been
      updated, against a reference data set (perhaps a database); it would make
      the raw pages on disk moot.
- [ ] run-report — a detailed report of each run, most likely JSON, replaced by
      every run, to observe a run from outside (the log is too obtuse):
      settings, stages, timings and latency per page kind, retries and WAF
      restarts, a failure's details, warnings (works with more than one entry,
      read-group oddities, unparsed `bookPublished`), publishing. Built on a run
      record (settings, stages, requests): the run's provenance.
- [ ] update-order — a warning (count only) and one entry in the run report:
      adjacent entries whose `userUpdatedAt` is out of the file's order (the
      list's, by Goodreads' "date updated"). A count, not per entry: which entry
      of a pair is off can't be told. ~45 expected (2026-11-21); a jump means
      Goodreads changed something.
- [ ] ci-speed — `bun run ci` takes about 140 s, about 130 of them in
      `run.test.ts`: 84 tests, each a full run against the fake Goodreads. Make
      them faster (shared runs, smaller fake lists) without losing what they
      check.
