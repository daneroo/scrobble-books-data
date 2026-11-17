# Shared by setup.sh, status.sh, teardown.sh and verify.sh (sourced, not run).
# Copied from im-weight's s3/scripts/ENV.sh, with the bucket added (README.md).
export AWS_PROFILE=im-dan

REGION='us-east-1'
BUCKET='im-scrobble-books'
OBJECT='goodreads.json'
USERNAME='im-scrobble-books-app'
POLICYNAME="${USERNAME}-policy"
PUBLIC_URL="https://${BUCKET}.s3.amazonaws.com/${OBJECT}"

# the repo root, from this folder
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# the app key, in the variables Bun's S3 client reads
S3_ENV_FILE="${REPO_ROOT}/secrets/S3.env"
