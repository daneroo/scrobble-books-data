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

# Needed for Goodreads scraping (login creds for scrape-ng/playwright)
GOODREADS_USERNAME=aaaaa
GOODREADS_PASSWORD=xyzxyz
```
