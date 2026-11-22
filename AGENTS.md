# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

scrobble-books-data scrapes Goodreads reading data into `goodreads.json`.
`bun run publish` uploads it to one public S3 object; `mirror-scrape-s3.yml`
commits that object to `main` when it changed, and fails when it is over 48
hours old.

## Git

- Development happens on a branch, never directly on `main`.
- The one exception: the mirror workflow commits the data (`Latest book data …`
  commits) straight to `main`, so `main` moves on its own.
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

- `apps/scrape` — the scraper
- `cue/` — the schema check for the output, with an example:
  `check-goodreads.cue` (`goodreads.json`)
- `.github/workflows/` — `mirror-scrape-s3.yml` (at minute 40 of every second
  hour, and by hand: fetches the S3 object, fails when its `Last-Modified` is
  over 48 hours old or it fails its CUE check, commits it to `main` as
  `Latest book data <Last-Modified>` if it changed), `unit.yml` (CI:
  `bun run ci`)
- `bun run scrape` — the single entry point of the scraper; options in
  `bun run scrape --help`
- `bun run login` — local, or in `just docker-login`'s desktop: a visible
  browser on `secrets/browser-profile/` at the Goodreads home page, left to the
  user; on close it prints "signed in" or "signed out"; the scraper never signs
  in. `--help` opens no browser
- `bun run cron` — runs `bun run scrape` (same options) as a child at minute 4
  of every second hour, UTC; no run at start; a fire time during a run is
  skipped and logged; SIGTERM stops the child, then cron
- `bun run setup` — `bun install`, then `bun run browser:install`: the pinned
  Playwright's Chromium (`--no-shell`), with `--with-deps` where `apt-get`
  exists (Docker, CI); never `bunx playwright`
- `bun run publish` (`bun run scrape --publish`) — after every passing run,
  changed or not, uploads `goodreads.json` to the S3 object
  (`apps/scrape/src/upload.ts`, the key in `secrets/S3.env`); a failed run
  uploads nothing. The scraper never runs git. A run restarts itself after a WAF
  challenge or too many retries (60 s apart, at most 100), reusing the pages it
  fetched; raw pages are deleted at the end unless `--save-pages`; stdout shows
  each stage's progress at most every 10 s, the log has every line; logs in
  `data/logs/`, the last 100 kept, a run that did not end archived as
  interrupted
- `infra/s3/` — scripts the user runs (`im-dan` AWS profile) to set up, check,
  show and tear down the S3 bucket and its write-only app user; setup writes
  `secrets/S3.env`; `verify.sh` overwrites the public object with the repo's
  `goodreads.json`. Agents never run setup or teardown
- `Justfile` — Docker only (the bun scripts are for local): `just docker-start`
  (`scrape`), `docker-logs`, `docker-stop`, `docker-login` (`login` until
  Enter), `docker-pins` (the Dockerfile's images are pinned as `tag@sha256:…`,
  the tag the intent; it checks each against its tag and says how to update);
  the one way to operate `infra/scrape/compose.yaml`; README.md's "Usage" points
  to it
- `infra/scrape/` — `compose.yaml`: one image (`apps/scrape/Dockerfile`, its
  build context an allowlist in `Dockerfile.dockerignore`), two services:
  `scrape`, always on, `bun run cron --publish`; `login`, behind a profile, a
  desktop on port 5800 for `bun run login`. The secrets come read-only from
  `secrets/`; the container's own profile and data, apart from local ones, are
  `infra/scrape/secrets/browser-profile/` and `infra/scrape/data/` (gitignored)
- `docs/` — lasting reference (agents, ADRs)
- `docs/goodreads-schema.html` — the `goodreads.json` schema, field by field
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
