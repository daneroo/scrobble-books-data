# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

scrobble-books-data scrapes Goodreads reading data on a GitHub Actions schedule
and commits the JSON outputs (`goodreads-rss*.json`) to `main`.

## Git

- Development happens on a branch, never directly on `main`.
- The one exception: `scrape.yml` pushes its updated data (`Latest book data …`
  commits) straight to `main` on every run, so `main` moves on its own.
- Commit or push only when the user asks for it at that moment.

## Quality

- `bunx markdownlint-cli2 "**/*.md"` — after editing markdown
- TODO: replace with script targets (bun or just), one gate (`ci`) covering
  source + markdown lint/format, tests, and CUE validation, as in prosodio

## Layout

- `apps/` — scrapers: `scrape` (deno, legacy), `scrape-ng` (bun),
  `scrape-browser` (Playwright prototype)
- `cue/` — schema checks for the outputs (`check-output.cue`)
- `.github/workflows/` — `scrape.yml` (scheduled scrape), `unit.yml` (CI)

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
