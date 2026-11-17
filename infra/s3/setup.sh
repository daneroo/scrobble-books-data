#!/usr/bin/env bash
# Creates the bucket (public read of goodreads.json only), the app user, its
# policy (write goodreads.json only) and its key, written to secrets/S3.env.
# Stops at the first step that fails; teardown.sh removes what was made.
set -euo pipefail
cd "$(dirname "$0")"
. ./ENV.sh

if [ -e "${S3_ENV_FILE}" ]; then
  echo "${S3_ENV_FILE} exists: run teardown.sh first, or remove it" >&2
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ${ACCOUNT_ID} (profile ${AWS_PROFILE})"

echo
echo "Creating bucket ${BUCKET} in ${REGION}"
aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"

echo
echo "Allowing a public bucket policy (public ACLs stay blocked)"
aws s3api put-public-access-block --bucket "${BUCKET}" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false

echo
echo "Setting the bucket policy: public read of ${OBJECT}"
aws s3api put-bucket-policy --bucket "${BUCKET}" --policy file://bucket-policy.json

echo
echo "Creating user ${USERNAME}"
aws iam create-user --user-name "${USERNAME}"

echo
echo "Creating policy ${POLICYNAME}"
aws iam create-policy --policy-name "${POLICYNAME}" --policy-document file://app-policy.json
policyArn="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICYNAME}"

echo
echo "Attaching ${policyArn} to ${USERNAME}"
aws iam attach-user-policy --user-name "${USERNAME}" --policy-arn "${policyArn}"

echo
echo "Creating an access key, written to ${S3_ENV_FILE}"
created=$(aws iam create-access-key --user-name "${USERNAME}" --output json)
keyId=$(jq -er .AccessKey.AccessKeyId <<<"${created}")
secret=$(jq -er .AccessKey.SecretAccessKey <<<"${created}")
umask 077
{
  echo "# ${USERNAME}: write ${OBJECT} in ${BUCKET}, nothing else (infra/s3/setup.sh)"
  echo "S3_ACCESS_KEY_ID=${keyId}"
  echo "S3_SECRET_ACCESS_KEY=${secret}"
  echo "S3_BUCKET=${BUCKET}"
  echo "S3_REGION=${REGION}"
} >"${S3_ENV_FILE}"

echo
echo "Done. Check with verify.sh (new keys can take a few seconds to work)"
