# Managing the S3 bucket for scrobble-books

Where a passing run publishes `goodreads.json`: the bucket `im-scrobble-books`
(us-east-1), its one object public-read at
<https://im-scrobble-books.s3.amazonaws.com/goodreads.json>. The app user
`im-scrobble-books-app` can only write that object.

Provenance: copied from im-weight's
[`s3/scripts/`](https://github.com/daneroo/im-weight/tree/b556b903803d74a60fcc8dd2052e162f14b654e9/s3/scripts)
(setup, status, teardown, `ENV.sh`, the app policy). Added here: the bucket, its
public-read policy, `verify.sh`, and the key written to `secrets/S3.env`.

## TODO

- make `keyrotation.sh` script

## S3 permission related operations

These operations are done using a more privileged user (`im-dan`, set in
`ENV.sh`). The scripts run from any folder.

### Setup

- Create the bucket, allow a public bucket policy (public ACLs stay blocked),
  set its policy (public `GetObject` on `goodreads.json`), and its CORS rule
  (`cors.sh`)
- Create the user, its policy `im-scrobble-books-app-policy` (`PutObject` on
  `goodreads.json`), attach it to the user
- Create an access key, written to `secrets/S3.env`

Stops at the first step that fails, and at once if `secrets/S3.env` exists.

```bash
infra/s3/setup.sh
```

### CORS

- GET and HEAD from any origin (`cors.json`), for browser pages; run by setup,
  or alone on the existing bucket

```bash
infra/s3/cors.sh
```

### Verify

- With the app key only: upload the repo's `goodreads.json`, check that a write
  to another key is denied, and that an anonymous GET returns the uploaded file

```bash
infra/s3/verify.sh
```

### Status

- The bucket, its public access block, policy and CORS rule, the public object's
  headers (as a browser page gets them), the user, its keys and when they were
  last used, the policy

```bash
infra/s3/status.sh
```

### Rotating keys

Not yet done

### Teardown

- Detach the policy from the user, delete the policy, the access keys, the user,
  the object and the bucket, and `secrets/S3.env`

```bash
infra/s3/teardown.sh
```
