#!/usr/bin/env bash
# Sets the bucket's CORS rule (cors.json): GET and HEAD from any origin, so a
# browser page (Datasette Lite, the site) can fetch the public goodreads.json.
# Replaces any CORS rule; safe to run again. Run by setup.sh, or alone on the
# existing bucket. Not the bucket policy: that is bucket-policy.json.
set -euo pipefail
cd "$(dirname "$0")"
. ./ENV.sh

echo "Setting the bucket CORS rule: GET and HEAD from any origin"
aws s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration file://cors.json
aws s3api get-bucket-cors --bucket "${BUCKET}"
