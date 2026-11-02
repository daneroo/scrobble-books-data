# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

scrobble-books-data scrapes Goodreads reading data on a GitHub Actions schedule
and commits the JSON outputs (`goodreads-rss.json` and the two
`goodreads-rss-ng*.json` files) to `main`.

## Git

- Development happens on a branch, never directly on `main`.
- The one exception: `scrape.yml` pushes its updated data (`Latest book data …`
  commits) straight to `main` on every run, so `main` moves on its own.
- Commit or push only when the user asks for it at that moment, or when
  finishing a ticket (below). Open PRs or merge to `main` only when asked.

## Working on a ticket

Issue #23 is split into sub-issues #24–#33, done in number order on the one
branch `23-replace-rss-scrapers` (no other branches).

- Start: the user types `/implement #N` on that branch.
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
- `cue/` — schema checks for the outputs (`check-output.cue`), with examples
- `.github/workflows/` — `scrape.yml` (scrape), `unit.yml` (CI: `bun run ci`),
  `login-test.yml` (manual: headless login + one list page; writes nothing)
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
