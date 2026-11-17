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

## S3.env

Written by `infra/s3/setup.sh`: the key of the app user, which can only write
`goodreads.json` in the bucket, in the variables Bun's S3 client reads.

```bash
# im-scrobble-books-app: write goodreads.json in im-scrobble-books, nothing else (infra/s3/setup.sh)
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=im-scrobble-books
S3_REGION=us-east-1
```

## browser-profile/

The Goodreads session: kept by `bun run login` (the user signs in by hand), read
by `bun run scrape`.
