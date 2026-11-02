# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

scrobble-books-data scrapes Goodreads reading data and commits the JSON outputs
(`goodreads.json` and `goodreads-rss.json`) to `main`. The user publishes by
hand with `bun run publish`; `scrape-staleness.yml` fails when either file is
over 48 hours old.

## Git

- Development happens on a branch, never directly on `main`.
- The one exception: the user's manual publish commits the data
  (`Latest book data …` commits) straight to `main`, so `main` moves on its own.
- Commit or push only when the user asks for it at that moment, or when
  finishing a ticket (below). Open PRs or merge to `main` only when asked.

## Working on a ticket

- Start: the user types `/implement #N` on the ticket's branch.
- If a criterion needs the user (an approval, a hand check, a secret, a run),
  ask in the session.
- Finish, without asking:
  1. `bun run ci` passes
  2. commit, then push the branch
  3. comment on the ticket: each acceptance criterion, met or not, and how it
     was checked; list any human step still open
  4. close the ticket
- `thoughts/BACKLOG.md` holds only ideas no ticket covers.

## Quality

- `bun run ci` — after every edit, before every commit: format check (Prettier),
  ESLint, markdownlint, `tsc`, `bun test`, CUE on the example files
- `bun run fmt` — fix formatting when `ci` fails

## Layout

A bun workspace; the root holds only tooling, agent and docs files, and the
published data.

- `apps/` — scrapers. `scrape` is the new scraper. `scrape-deno`, `scrape-ng`
  (bun) and `scrape-browser` (Playwright prototype) are read-only references:
  outside the workspace and excluded from the gate.
- `cue/` — schema checks for the outputs, with examples: `check-output.cue`
  (`goodreads-rss.json`), `check-goodreads.cue` (`goodreads.json` and its
  segments)
- `.github/workflows/` — `scrape-staleness.yml` (fails when the published data
  is over 48 hours old), `scrape.yml` (old scrape, disabled), `unit.yml` (CI:
  `bun run ci`)
- `bun run scrape` — the single entry point of the new scraper; options in
  `bun run scrape --help`
- `bun run publish` — the one exception: it wraps git around the scraper (on
  `main`, clean tree, pull, scrape) and prints the commit-and-push line; it
  never commits or pushes itself
- `docs/` — lasting reference (agents, ADRs)
- `thoughts/BACKLOG.md` — idea inbox; other `thoughts/` files are temporary
- `data/` — gitignored, volatile (outputs, scratch)

## Agent skills

### Issue tracker

GitHub Issues on `daneroo/scrobble-books-data`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label string equal to its role name. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`, created lazily. See
`docs/agents/domain.md`.
