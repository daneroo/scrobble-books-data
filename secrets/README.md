# Secrets and Credentials

The .env files can be brought into shell scope with `source` or `.`

```bash
set -a && source secrets/<file>.env && set +a
```

## GITHUB.env

Both GOODREADS.env and WEB3STORAGE.env are used in the scrape action.

## WEB3STORAGE.env

These can be genrated with the script/snipet in [`apps/pin-sh/README.md # Credentials`](../apps/pin-sh/README.md)

```bash
W3_PRINCIPAL=MgZZZZZZZ=
W3_PROOF=mAYIE_VERY_LONG_BASE64_TEXT_KotQfXw
```

## GOODREADS.env

```bash
GOODREADS_USER=nnnn
GOODREADS_KEY=xxxxx
```
