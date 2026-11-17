#!/usr/bin/env bash
# Removes what setup.sh made: the app user's keys, policy and user, the bucket
# and its object, and secrets/S3.env. Keeps going past what is already gone.
set -uo pipefail
cd "$(dirname "$0")"
. ./ENV.sh

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
policyArn="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICYNAME}"
echo "Account ${ACCOUNT_ID} (profile ${AWS_PROFILE})"

echo
echo "Detaching ${policyArn} from ${USERNAME}"
aws iam detach-user-policy --user-name "${USERNAME}" --policy-arn "${policyArn}"

echo
echo "Deleting policy ${policyArn}"
aws iam delete-policy --policy-arn "${policyArn}"

echo
echo "Deleting the access keys of ${USERNAME}"
for keyId in $(aws iam list-access-keys --user-name "${USERNAME}" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
  aws iam delete-access-key --user-name "${USERNAME}" --access-key-id "${keyId}"
done

echo
echo "Deleting user ${USERNAME}"
aws iam delete-user --user-name "${USERNAME}"

echo
echo "Deleting s3://${BUCKET}/${OBJECT} and the bucket"
aws s3api delete-object --bucket "${BUCKET}" --key "${OBJECT}"
aws s3api delete-bucket --bucket "${BUCKET}" --region "${REGION}"

echo
echo "Deleting ${S3_ENV_FILE}"
rm -f "${S3_ENV_FILE}"

echo
echo "Done"
