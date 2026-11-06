#!/usr/bin/env bash
# bun run publish [scrape options], e.g. -c 3 --rate 2.2 (#32)
# On main with a clean tree: pulls, then scrapes until a run passes. Attempt 1
# is a full scrape; after a failure it waits PAUSE_S and reruns with --cached
# (only the pages still missing are fetched), keeping the other options but
# not --interactive (the restarts reuse the session just signed in). On a
# pass, if the data changed, it commits goodreads.json and goodreads-rss.json
# (only) and pushes. Everything goes to data/logs/publish.log, archived with
# the end time when the run ends.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

MAX_ATTEMPTS=100 # then we stop
PAUSE_S=60      # before each --cached restart

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

log=data/logs/publish.log
mkdir -p data/logs
rm -f "$log"

note() { echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$log"; }

# Ends the run: archives the log, exits with the given status.
finish() {
  note "publish end: $1"
  archive=data/logs/publish-until-$(date -u +%Y-%m-%dT%H-%MZ).log
  mv "$log" "$archive"
  echo "publish: $1; log: $archive"
  exit "$2"
}

note "publish start: $*"
if ! git pull --ff-only 2>&1 | tee -a "$log"; then
  finish "git pull failed" 1
fi

restart_args=()
for arg in "$@"; do
  [ "$arg" = --interactive ] || restart_args+=("$arg")
done

attempt=1
args=("$@")
while true; do
  stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  note "attempt $attempt start ${args[*]:-}"
  bun run scrape ${args[@]+"${args[@]}"} 2>&1 | tee -a "$log"
  status=$?
  note "attempt $attempt end, exit $status"
  [ "$status" -eq 0 ] && break
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    finish "gave up after $attempt attempts" 1
  fi
  attempt=$((attempt + 1))
  args=(--cached ${restart_args[@]+"${restart_args[@]}"})
  note "waiting ${PAUSE_S}s"
  sleep "$PAUSE_S"
done

if [ -z "$(git status --porcelain -- goodreads.json goodreads-rss.json)" ]; then
  finish "passed after $attempt attempts, nothing changed" 0
fi
git diff --stat -- goodreads.json goodreads-rss.json | tee -a "$log"
if ! git commit -m "Latest book data $stamp" -- goodreads.json goodreads-rss.json 2>&1 | tee -a "$log"; then
  finish "passed after $attempt attempts, commit failed" 1
fi
if ! git push 2>&1 | tee -a "$log"; then
  finish "passed after $attempt attempts, committed, push failed" 1
fi
finish "passed after $attempt attempts, committed and pushed" 0
