#!/usr/bin/env bash
# Shows the bucket, the public object, the app user, its keys and its policy.
# Read-only; keeps going past what is missing.
set -uo pipefail
cd "$(dirname "$0")"
. ./ENV.sh

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
policyArn="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICYNAME}"
echo "Account ${ACCOUNT_ID} (profile ${AWS_PROFILE})"

echo
echo "Bucket ${BUCKET}"
aws s3api get-bucket-location --bucket "${BUCKET}"

echo
echo "Bucket public access block"
aws s3api get-public-access-block --bucket "${BUCKET}"

echo
echo "Bucket policy"
aws s3api get-bucket-policy --bucket "${BUCKET}" --query Policy --output text | jq .

echo
echo "Anonymous HEAD ${PUBLIC_URL}"
curl -sSI "${PUBLIC_URL}" | grep -iE '^(HTTP|last-modified|content-length|content-type|etag)'

echo
echo "User ${USERNAME}"
aws iam get-user --user-name "${USERNAME}"

echo
echo "Access keys"
aws iam list-access-keys --user-name "${USERNAME}"

echo
echo "Keys last used"
for keyId in $(aws iam list-access-keys --user-name "${USERNAME}" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
  aws iam get-access-key-last-used --access-key-id "${keyId}"
done

echo
echo "Policy ${POLICYNAME}"
aws iam get-policy --policy-arn "${policyArn}"
version=$(aws iam get-policy --policy-arn "${policyArn}" --query Policy.DefaultVersionId --output text)
aws iam get-policy-version --policy-arn "${policyArn}" --version-id "${version}" --query PolicyVersion.Document

echo
echo "Policies attached to ${USERNAME}"
aws iam list-attached-user-policies --user-name "${USERNAME}"

echo
echo "Done"
