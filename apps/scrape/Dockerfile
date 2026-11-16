# From the #58 prototype: `bun run login` in a desktop streamed to a browser
# tab. Build context: the repo root (see infra/scrape/compose.yaml).
# Playwright's Chromium is installed by the pinned Playwright in node_modules,
# never `bun x playwright` (that fetched the latest and a newer Chromium).

# Base: one of the two below; the other stays commented out.
# Selkies (checked in #58): port 3001 HTTPS; PUID/PGID; app in /defaults/autostart
# FROM ghcr.io/linuxserver/baseimage-selkies:debiantrixie
# jlesage: port 5800 HTTP; USER_ID/GROUP_ID; app in /startapp.sh
FROM jlesage/baseimage-gui:debian-13-v4

COPY --from=oven/bun:1.4.4-debian /usr/local/bin/bun /usr/local/bin/bun

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Selkies:
# ENV TITLE="scrobble login"
# RUN apt-get update && \
#     apt-get install -y --no-install-recommends xterm && \
#     rm -rf /var/lib/apt/lists/*
# jlesage:
RUN add-pkg xterm && set-cont-env APP_NAME "scrobble login" && mkdir -p /config/log

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/scrape/package.json apps/scrape/
RUN bun install --frozen-lockfile --production && \
    cd apps/scrape && bun node_modules/playwright/cli.js install --with-deps chromium && cd /app && \
    chmod -R a+rX /ms-playwright && \
    rm -rf /var/lib/apt/lists/*
COPY apps/scrape/src apps/scrape/src
