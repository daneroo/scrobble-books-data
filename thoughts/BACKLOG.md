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
- [ ] incremental-scrape — stop a run early once no more entries have been
      updated, against a reference data set (perhaps a database); it would make
      the raw pages on disk moot.
- [ ] run-report — a detailed report of each run, most likely JSON, replaced by
      every run, to observe a run from outside (the log is too obtuse):
      settings, stages, timings and latency per page kind, retries and WAF
      restarts, a failure's details, warnings (works with more than one entry,
      read-group oddities, unparsed `bookPublished`), publishing. Built on a run
      record (settings, stages, requests): the run's provenance.
