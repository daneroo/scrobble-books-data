#!/usr/bin/env bash
# bun run publish (#32): on main, runs the scraper, then prints the one-line
# command that commits and pushes the data. It never commits or pushes itself.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

branch=$(git branch --show-current)
if [ "$branch" != main ]; then
  echo "publish: on '$branch', not main; stopping" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "publish: the working tree is not clean; stopping" >&2
  git status --short >&2
  exit 1
fi
git pull --ff-only

stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if ! bun run scrape; then
  echo "publish: the scrape failed; stopping" >&2
  exit 1
fi

if [ -z "$(git status --porcelain -- goodreads.json goodreads-rss.json)" ]; then
  echo "publish: nothing changed"
  exit 0
fi
git diff --stat -- goodreads.json goodreads-rss.json
echo
echo "git add goodreads.json goodreads-rss.json && git commit -m \"Latest book data $stamp\" && git push"
