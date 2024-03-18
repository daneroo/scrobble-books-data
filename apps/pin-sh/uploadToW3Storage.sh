#!/usr/bin/env bash
# Enable strict mode
set -euo pipefail
# -e: Exit immediately if any command returns a non-zero status
# -u: Treat unset variables as an error
# -o pipefail: Return a non-zero status if any command in a pipeline fails

# This can be file(s) or a directory (repo root relative)
ROOT_RELATIVE_UPLOAD_PATHS="goodreads-rss.json goodreads-rss-ng.json goodreads-rss-ng-progress.json"
# This must be a file path (repo root relative)
ROOT_RELATIVE_RESULT_PATH=goodreads-ipfs.json

# bash function to print a header, with a message and a separator
print_header() {
  local message="$1"
  local separator="-"
  echo -e "\n$separator $message\n"
}

# bash function to check if a set of commands exist, print all missing commands and exit if any are missing
commands_exist() {
  local missing=0
  for cmd in "$@"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Command '$cmd' not found. Please install it."
      missing=1
    fi
  done
  if [ $missing -eq 1 ]; then
    exit 1
  fi
}

# bash function that check if a set of environment variables are set
env_vars_exist() {
  local missing=0
  for var in "$@"; do
    if [ -z "${!var-}" ]; then
      echo "Environment variable '$var' is not set. Please set it."
      missing=1
    fi
  done
  if [ $missing -eq 1 ]; then
    exit 1
  fi
}

# calulate number and size of uploads / with totals
calulate_number_and_size_of_uploads() {
  #  ❯ w3 ls --json
  # {"root":{"/":"bafybXXX"},"shards":[{"/":"bagbaieraYYY"}]}
  # w3 ls --shards
  # ❯ w3 can store ls --json
  # {"link":{"/":"bagbaieraUUUU"},"size":4456}
total_size=$(w3 can store ls --json | jq '.size' | awk '{sum += $1} END {print sum}')
numner_of_uploads=$(w3 ls --json | wc -l)
echo " Number of uploads: $numner_of_uploads Total size: ${total_size:-0} bytes"
}


# check that required commands exist
commands_exist npm node jq w3

# check for required env vars
env_vars_exist W3_PRINCIPAL W3_PROOF

# add our proof
print_header "Adding proof to gain access to w3 space (books)"
w3 space add $W3_PROOF

print_header "Showing added proof and capabilities"
w3 proof ls

print_header "Calculating space before upload"
calulate_number_and_size_of_uploads

print_header "Uploading file(s) to w3 storage (books)"
echo "  uploading path/files: $ROOT_RELATIVE_UPLOAD_PATHS"

rootCID=$(w3 up ${ROOT_RELATIVE_UPLOAD_PATHS} --json | jq -r '.root."/"')
echo "  uploaded CID: $rootCID"

print_header "Calculating space after upload"
calulate_number_and_size_of_uploads

print_header "Trimming w3 storage (books)"
for i in $(w3 ls); do
  # remove if == rootCID
  if [ "$i" == "$rootCID" ]; then
    echo "Keeping $i"
  else
    echo "Removing $i (with shards)"
    w3 rm $i --shards
  fi
done

print_header "Calculating space after trim"
calulate_number_and_size_of_uploads

print_header "Link to uploaded file(s) and write result"
rootLink="https://${rootCID}.ipfs.w3s.link/"

# Initialize fileLinks as an empty string
fileLinks=""
# Split the paths and create links
IFS=' ' read -ra PATHS <<< "$ROOT_RELATIVE_UPLOAD_PATHS"
for path in "${PATHS[@]}"; do
    # Construct the full file link
    fileLink="${rootLink}${path}"
    
    # Append new link to the fileLinks string
    [[ -n $fileLinks ]] && fileLinks+=","
    fileLinks+="\"$fileLink\""
done

echo "  writing result to: $ROOT_RELATIVE_RESULT_PATH"
# Write the JSON output, piping to jq to format and validate the JSON
echo "{
  \"rootCID\": \"$rootCID\",
  \"rootLink\": \"$rootLink\",
  \"fileLinks\": [$fileLinks]
}" | jq > "$ROOT_RELATIVE_RESULT_PATH"

echo " root CID: $rootCID"
echo " root link: $rootLink"
echo " file links:"
# cat $ROOT_RELATIVE_RESULT_PATH | jq .fileLinks
cat "$ROOT_RELATIVE_RESULT_PATH" | jq -r '.fileLinks[]' | while read -r link; do
    echo "  - $link"
done

print_header "Done"
