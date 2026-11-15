# Secrets and Credentials

The .env files can be brought into shell scope with `source` or `.`

```bash
set -a && source secrets/<file>.env && set +a
```

## GOODREADS.env

Read by `bun run scrape`.

```bash
# the Goodreads user id, as in /review/list/<id>
GOODREADS_USER=nnnn
```

## browser-profile/

The Goodreads session: kept by `bun run login` (the user signs in by hand), read
by `bun run scrape`.
