#!/usr/bin/env bash
# bash apps/scrape/waf-experiment.sh [scrape options], e.g. -c 1 --rate 0.5
# A firewall (WAF) experiment: one full publish, then publish --cached until
# one passes (the --cached restarts reuse the pages already fetched).
# Everything goes to data/logs/scrape-waf-continue.log, which is archived
# with the end time when the experiment ends. Never commits or pushes.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

MAX_ATTEMPTS=10 # then give up
PAUSE_S=60      # before each --cached restart

log=data/logs/scrape-waf-continue.log
mkdir -p data/logs
rm -f "$log"

note() { echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$log"; }

note "experiment start: $*"
attempt=1
cached=()
while true; do
  note "attempt $attempt start ${cached[*]:-} $*"
  bun run publish ${cached[@]+"${cached[@]}"} "$@" 2>&1 | tee -a "$log"
  status=$?
  note "attempt $attempt end, exit $status"
  if [ "$status" -eq 0 ]; then
    result="passed after $attempt attempts"
    break
  fi
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    result="gave up after $attempt attempts"
    break
  fi
  attempt=$((attempt + 1))
  cached=(--cached)
  note "waiting ${PAUSE_S}s"
  sleep "$PAUSE_S"
done

note "experiment end: $result"
archive=data/logs/scrape-waf-continue-until-$(date -u +%y%m%d-%H%M).log
mv "$log" "$archive"
echo "waf-experiment: $result; log: $archive"
[ "$status" -eq 0 ]
