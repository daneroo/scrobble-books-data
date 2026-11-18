# One image for both services of infra/scrape/compose.yaml: `login` runs
# jlesage's desktop (a terminal for `bun run login`), `scrape` replaces the
# entry point with `bun run cron --publish`. Build context: the repo root;
# only what apps/scrape/Dockerfile.dockerignore allows is sent. Secrets, the
# browser profile and data/ are mounted at run time, never copied in.

# Replaced, for size: ghcr.io/linuxserver/baseimage-selkies:debiantrixie (#58: port 3001 HTTPS, PUID/PGID, app in /defaults/autostart)
# Images are pinned as tag@sha256: the tag is the intent, Docker uses the
# sha256. Check or update them with `just docker-pins`.
FROM jlesage/baseimage-gui:debian-13-v4.14.0@sha256:887c603e603eb14f9dc18a0d8076b465a38504da0b57317c1fb402f3bc7ebd05

# bun: the version of package.json's packageManager
COPY --from=oven/bun:1.4.4-debian@sha256:93d5032fe06d163427822dc1598f420363759bb18155c9cc90eb1be05a64a19e /usr/local/bin/bun /usr/local/bin/bun
# cue: a run checks goodreads.json with `cue vet` before it publishes; the
# version unit.yml uses
COPY --from=cuelang/cue:0.17.1@sha256:520f883dcc92642389b3b75e8befe4e5a233a1aa903a8c846c4a3b338b202635 /usr/bin/cue /usr/local/bin/cue

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN add-pkg xterm && set-cont-env APP_NAME "scrobble login" && mkdir -p /config/log

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/scrape/package.json apps/scrape/
# bun run setup: bun install, then the pinned Playwright's Chromium, with its
# system libraries (apt); never `bunx playwright` (it fetches a newer Chromium)
RUN bun run setup --frozen-lockfile --production && \
    chmod -R a+rX /ms-playwright && \
    rm -rf /var/lib/apt/lists/*
COPY cue/check-goodreads.cue cue/
COPY apps/scrape/src apps/scrape/src
# the run, as the host user, writes goodreads.json here before the upload
RUN chmod a+w /app
