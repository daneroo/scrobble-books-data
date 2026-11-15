# Secrets and Credentials

The .env files can be brought into shell scope with `source` or `.`

```bash
set -a && source secrets/<file>.env && set +a
```

## GOODREADS.env

Read by `bun run scrape` (and so `bun run publish`).

```bash
# Needed for Goodreads scraping (rss feed in xml)
GOODREADS_USER=nnnn
## Not sure this is actually needed, but still used in rss fetch url param key=
GOODREADS_KEY=xxxxx
```

## browser-profile/

The Goodreads session: kept by `bun run login` (the user signs in by hand), read
by `bun run scrape`.
