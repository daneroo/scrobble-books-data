# ipfs pinning web3-storage (new) w3cli version

Until we can rewrite the JS version of pinning, we will use the `w3` cli.

OK, this is way to complicated to use from JS Code.
We need to use the `w3` cli.
This is what the [add-to-web3 GitHub Action](https://github.com/marketplace/actions/add-to-web3) does.

_Note:_ local W3.Storage Credentials are in `~/Library/Preferences/w3access/w3cli.json`, and
current Space is also stored in this file `~/.config/configstore/update-notifier-\@web3-storage/`

## TODO

looks like THE DELEGATE PROOFS needs to be updated:

Perhaps:

```txt
w3 delegation create did:key:z6M... --can 'space/*' --can 'upload/*' --can 'filecoin/*' --base64
```

```txt
client/dist/src/blob.js:176
        throw new Error(`failed ${BlobCapabilities.add.can} invocation`, {
              ^

Error: failed space/blob/add invocation
```

Need to update:

```bash
W3_PROOF=$(w3 delegation create $AUDIENCE -c 'store/*' -c 'upload/*' --base64)
```

## Approach

using the `w3` cli, we can upload a file, and remove all other older files.

- credentials: see [Upload from CI](https://web3.storage/docs/how-to/ci/)
- prove we can revoke all credentials

## Usage

```bash
docker compose run --rm -it upload-to-web3storage
# or from the root of this repo
docker compose -f apps/pin-sh/compose.yaml run --rm -it upload-to-web3storage
```

## Total usage

Get total usage for the current space:

```bash
w3 ls --shards
w3 can store ls --json
w3 can store ls --json | jq '.size' | awk '{sum += $1} END {print sum}'
```

## Credentials

The process is described in the [W3.Storage Docs](https://web3.storage/docs/how-to/ci/)

Local (master) credentials are in `~/Library/Preferences/w3access/w3cli.json`, and obtained by `w3 login`.

For generating credentials for CI, we need to:

- Prepare delegated credentials
  - Create a key and did (`ci-key.json`)
  - Create a signed proof that you delegate capabilities to that key (`delegate-proof-books-rwx.base64.txt`)
    - [Capabilities docs](https://github.com/web3-storage/specs/blob/main/w3-store.md)
  - Store them as an env file (`WEB3STORAGE.env`)

To show the current delegated credentials, enter this command,
where you will see that the `did` from our generated `ci-key.json` appears as the audience field.

```bash
 w3 delegation ls
 bafyreiaXXXX # <-- cid of this delegation record
  audience: did:key:z6MkYYYY # <-- this is the did from ci-key.json
  with: did:key:z6MkZZZZ # <-- this is the did for the current space (books) when w3 delegation create was run
  can: store/* # <-- a capability
  with: did:key:z6MkZZZZ # <-- this is the did for the current space (books) when w3 delegation create was run
  can: upload/* # <-- a capability
```

### Generating secrets

This script generates and env file with the credentials for the CI to use.
It has `W3_PRINCIPAL` and `W3_PROOF` that are used by the `w3` cli.

```bash
# Create key and did.
w3 key create --json > ci-key.json
# Use the output `key` value as W3_PRINCIPAL
W3_PRINCIPAL=$(jq -r .key ci-key.json)
# Extract the did as $AUDIENCE (temp)
AUDIENCE=$(jq -r .did ci-key.json)
# Create a signed proof that you delegate capabilities to that key.
# * using capabilities store/* and upload/* (we ned to list,create and delete from CI)
# * Could probably add expiration --exp
W3_PROOF=$(w3 delegation create $AUDIENCE -c 'store/*' -c 'upload/*' --base64)
# Write the env file
ENV_FILE_CONTENT=$(cat <<EOF
W3_PRINCIPAL=${W3_PRINCIPAL}
W3_PROOF=${W3_PROOF}
EOF
)
echo "${ENV_FILE_CONTENT}" > WEB3STORAGE.env
```

### Using secrets

To use the delegated credentials, we need to set the `W3_PRINCIPAL` and `W3_PROOF` in the CI environment,
and then:

```bash
# w3 will look for the required signing key in the W3_PRINCIPAL environment variable
w3 space add $W3_PROOF
```

### Revoking secrets

You can revoke the delegated credentials:

```bash
w3 delegation ls
w3 delegation revoke bafyreiaXXXX

```

## From CI

```bash
# Choose a space that you want CI to upload to
# Create a signing key for CI to use with w3 key create
# Create a proof that delegates capabilities to upload to your space to that key
# Then in the CI environment

# Install w3cli from npm
npm i --global @web3-storage/w3cli
# or can use npx: npx @web3-storage/w3cli ...

# This part is in CI
# Import the signing key by setting it as W3_PRINCIPAL in the env
echo export W3_PRINCIPAL=$(jq -r .key ci-key.json)
W3_PRINCIPAL=$(jq -r .key ci-key.json)

# Import the proof by passing it to w3 space add
echo export W3_PROOF=$(cat delegate-proof-books-rwx.base64.txt)
W3_PROOF=$(cat delegate-proof-books-rwx.base64.txt)
w3 space add $W3_PROOF

# Upload your files with w3 up
```

### Reset

Remove all proofs/delegations from the store but retain the agent DID.

```bash
# This is from the pull request for feat: add reset command https://github.com/web3-storage/w3cli/pull/170
w3 whoami
w3 space ls

w3 reset

w3 whoami
w3 space ls

w3 login daniel.lauzon@gmail.com
w3 whoami
w3 space ls
```

## `w3` cli

```bash
# setup
npm install -g @web3-storage/w3cli

w3 login daniel.lauzon@gmail.com
# credentials are in ~/Library/Preferences/w3access/w3cli.json
# currentSpace is also stored in this file
# ~/.config/configstore/update-notifier-\@web3-storage/

$ w3 account ls
did:mailto:gmail.com:daniel.lauzon

$ w3 plan get
⁂ did:web:starter.web3.storage

$ w3 space ls
  did:key:z6MkmwcwCLmuTxY6mWhh9BVmj8t7EZ2rjKtc7cTVYhjN77jq books

w3 space create books
w3 space use books

w3 up README.md
```

## References

- [Web3.Storage Capabilities - store](https://github.com/web3-storage/specs/blob/main/w3-store.md)
- [JS Client](https://web3.storage/docs/w3up-client/)
- [Quickstart](https://web3.storage/docs/quickstart/)
