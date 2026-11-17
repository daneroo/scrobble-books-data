#!/usr/bin/env bash
# With the app key from secrets/S3.env (not the im-dan profile): uploads the
# repo's goodreads.json, checks that a write to another key is denied, and
# that an anonymous GET of the public URL returns the uploaded file.
set -euo pipefail
cd "$(dirname "$0")"
. ./ENV.sh
FILE="${REPO_ROOT}/goodreads.json"

if [ ! -e "${S3_ENV_FILE}" ]; then
  echo "${S3_ENV_FILE} is missing: run setup.sh first" >&2
  exit 1
fi

# the app key only: no profile, no other credentials
unset AWS_PROFILE AWS_SESSION_TOKEN
set -a
. "${S3_ENV_FILE}"
set +a
export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}"
export AWS_REGION="${S3_REGION}" AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null

fail=0

echo "Upload ${FILE} to s3://${BUCKET}/${OBJECT}"
if aws s3api put-object --bucket "${BUCKET}" --key "${OBJECT}" --body "${FILE}" \
  --content-type application/json >/dev/null; then
  echo "  ok: uploaded"
else
  echo "  FAIL: upload refused"
  fail=1
fi

echo
echo "Upload to s3://${BUCKET}/not-${OBJECT} (must be denied)"
if out=$(aws s3api put-object --bucket "${BUCKET}" --key "not-${OBJECT}" --body "${FILE}" 2>&1); then
  echo "  FAIL: the write was allowed"
  fail=1
elif grep -q AccessDenied <<<"${out}"; then
  echo "  ok: AccessDenied"
else
  echo "  FAIL: refused, but not as AccessDenied: ${out}"
  fail=1
fi

echo
echo "Anonymous GET ${PUBLIC_URL}"
local_sum=$(shasum -a 256 "${FILE}" | cut -d' ' -f1)
remote_sum=$(curl -fsS "${PUBLIC_URL}" | shasum -a 256 | cut -d' ' -f1) || remote_sum='(GET failed)'
if [ "${local_sum}" = "${remote_sum}" ]; then
  echo "  ok: same as the uploaded file (sha256 ${local_sum})"
else
  echo "  FAIL: sha256 ${remote_sum}, expected ${local_sum}"
  fail=1
fi

echo
if [ "${fail}" = 0 ]; then echo "All checks passed"; else echo "Some checks failed"; fi
exit "${fail}"
