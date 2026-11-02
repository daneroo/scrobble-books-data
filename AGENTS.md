# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

scrobble-books-data scrapes Goodreads reading data on a GitHub Actions schedule
and commits the JSON outputs (`goodreads-rss.json` and the two
`goodreads-rss-ng*.json` files) to `main`.

## Git

- Development happens on a branch, never directly on `main`.
- The one exception: `scrape.yml` pushes its updated data (`Latest book data …`
  commits) straight to `main` on every run, so `main` moves on its own.
- Commit or push only when the user asks for it at that moment.

## Quality

- `bun run ci` — after every edit, before every commit: format check (Prettier),
  ESLint, markdownlint, `tsc`, `bun test`, CUE on the example files
- `bun run fmt` — fix formatting when `ci` fails

## Layout

A bun workspace; the root holds only tooling, agent and docs files, and the
published data.

- `apps/` — scrapers. `scrape-deno`, `scrape-ng` (bun) and `scrape-browser`
  (Playwright prototype) are read-only references: outside the workspace and
  excluded from the gate.
- `cue/` — schema checks for the outputs (`check-output.cue`), with examples
- `.github/workflows/` — `scrape.yml` (scrape), `unit.yml` (CI: `bun run ci`)
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
