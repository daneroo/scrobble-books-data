# IPFS Removal Cleanup TODO

Temporary checklist for fully removing deprecated Storacha/web3.storage/IPFS pinning without breaking scraping or CI.

## Decision

- [x] Confirm that this repo no longer publishes to Storacha/web3.storage.
- [x] Confirm that "normal IPFS" support will not be preserved in the current cleanup.
- [x] If IPFS publishing returns later, implement it as a fresh app targeting local Kubo/IPFS Cluster, not by adapting `apps/pin` or `apps/pin-sh`.

## Remove Pinning Apps

- [x] Delete `apps/pin`.
  - [x] Remove `apps/pin/src/pin.js`.
  - [x] Remove `apps/pin/src/pin-test.js`.
  - [x] Remove `apps/pin/package.json`.
  - [x] Remove `apps/pin/pnpm-lock.yaml`.
  - [x] Confirm no `apps/pin` entry remains in the root workspace lockfile.
- [x] Delete `apps/pin-sh`.
  - [x] Remove `apps/pin-sh/uploadToW3Storage.sh`.
  - [x] Remove `apps/pin-sh/compose.yaml`.
  - [x] Remove `apps/pin-sh/Dockerfile`.
  - [x] Remove `apps/pin-sh/README.md`.

## Clean Package And Dependency State

- [x] Regenerate the root lockfile after removing the `apps/pin` workspace package.
  - [x] Run `pnpm install --lockfile-only`.
- [x] Verify no package manifest still depends on web3.storage/IPFS pinning libraries.
  - [x] `rg -n "web3.storage|@web3-storage|ipfs-car|w3cli" package.json apps packages cue`
- [x] Verify `pnpm-lock.yaml` no longer contains pinning-only dependencies unless another active package requires them.
  - [x] `web3.storage`
  - [x] `@web3-storage/multipart-parser`
  - [x] `@web3-storage/parse-link-header`
  - [x] `ipfs-car`
  - [x] `ipfs-core-types`
  - [x] `ipfs-core-utils`
  - [x] `ipfs-unixfs`
  - [x] `ipfs-unixfs-exporter`
  - [x] `ipfs-unixfs-importer`
  - [x] `ipfs-utils`
- [x] Confirm `pnpm-workspace.yaml` still behaves correctly after the two app directories are deleted.
  - [x] It can remain as `apps/*`; no explicit pin workspace entry exists today.
  - [x] `pnpm install --lockfile-only` completed with the reduced workspace scope.
  - [x] Root lockfile importers no longer include `apps/pin`.
  - [ ] Run `pnpm -r list --depth -1` and confirm `pin` is gone.
    - Note: attempted once; it hung and then failed with `fetch failed`, so this remains open.
- [ ] Remove any dependency-management docs or scripts that existed only for `apps/pin`.
  - [x] `apps/pin` `deps:check` / `deps:update` scripts disappear with the app.
  - [x] Remaining dependency-management scripts are only in active workspaces.
  - [ ] Root `pnpm deps:check` and `pnpm deps:update` should still work for remaining workspaces.
- [ ] Confirm install remains clean.
  - [ ] `pnpm install --frozen-lockfile`
  - [ ] `pnpm -r test`

## Clean GitHub Actions

- [x] Update `.github/workflows/scrape.yml`.
  - [x] Remove `W3_PRINCIPAL` from `jobs.scrape.env`.
  - [x] Remove `W3_PROOF` from `jobs.scrape.env`.
  - [x] Remove the `Install jq (for pin-sh)` step if no other workflow step needs `jq`.
  - [x] Remove the `Install @web3-storage/w3cli (for pin-sh)` step.
  - [x] Remove `jq --version` from the `Report versions` step if `jq` is no longer installed.
  - [x] Remove `w3 --version` from the `Report versions` step.
  - [x] Remove the disabled `Pin to web3.storage (bash / w3 cli)` step.
  - [x] Remove the commented `Pin to web3.storage (node)` step.
  - [x] Remove `goodreads-ipfs.json` from the `git-auto-commit-action` `file_pattern`.
- [x] Confirm GitHub Actions setup is still minimal and complete.
  - [x] Keep `pnpm/action-setup` because the repo still uses pnpm orchestration.
  - [x] Keep `actions/setup-node` if needed by pnpm/Bun tooling or remaining Node workspaces.
  - [x] Keep `oven-sh/setup-bun` while `apps/scrape-ng` still runs with Bun.
  - [x] Keep `denoland/setup-deno` while `apps/scrape` still runs with Deno.
  - [x] Keep `cue-lang/setup-cue` while the CUE validation steps remain.
  - [x] Remove any Docker, Compose, npm global install, `jq`, or `w3` setup that was only for pinning.
- [x] Search workflow files for leftover pinning setup.
  - [x] `rg -n "pin|ipfs|web3|w3cli|W3_|WEB3|jq|docker compose|goodreads-ipfs" .github`
- [ ] Run the workflow-equivalent local checks that do not require GitHub secrets.
  - [x] `pnpm test`
    - Note: passed in user shell; Codex runner hangs/fails before pnpm runs project tests.
  - [x] `pnpm lint`
    - Note: passed in user shell; Codex runner hangs/fails before pnpm runs project lint.
  - [ ] Scrape workflow dry run if practical: `pnpm act:scrape`
- [x] Confirm the scheduled scrape still writes and commits only:
  - [x] `goodreads-rss.json`
  - [x] `goodreads-rss-ng.json`
  - [x] `goodreads-rss-ng-progress.json`

## Clean Repo Data And Docs

- [x] Decide whether to delete `goodreads-ipfs.json`.
  - [x] Delete it if it should no longer be a published current artifact.
  - [x] Keep it only if it is intentionally retained as historical data, and document that clearly.
- [x] Update `README.md`.
  - [x] Remove the IPFS/web3.storage item from the current task description.
  - [x] Remove `goodreads-ipfs.json` from public data file links if the file is deleted.
  - [x] Remove web3.storage console references.
  - [x] Remove `apps/pin` and `apps/pin-sh` usage commands.
  - [x] Remove old TODOs about reimplementing web3.storage/w3up-client.
  - [x] Replace with a short historical note only if useful.
- [x] Update `secrets/README.md`.
  - [x] Remove the `WEB3STORAGE.env` section.
  - [x] Remove statements saying `WEB3STORAGE.env` is used by the scrape action.
  - [x] Keep only the Goodreads credential documentation that is still active.

## Clean Ignored Local Credentials

These files are ignored by git, so this cleanup has to happen locally and should not expose their contents.

- [x] Delete local `secrets/WEB3STORAGE.env`.
- [x] Remove any W3/web3.storage/Storacha variables from local `secrets/GITHUB.env`.
  - [x] `W3_PRINCIPAL`
  - [x] `W3_PROOF`
  - [x] Any old `WEB3STORAGE_TOKEN` value, if present.
- [x] Check whether any generated web3.storage CLI config remains on this machine and remove it if no longer needed.
  - [x] `~/.config/configstore/update-notifier-@web3-storage/`
  - [x] Any other local `w3`/web3.storage config created while testing.
- [x] Keep `secrets/GOODREADS.env` and unrelated credentials unchanged.

## Clean GitHub Repository Secrets

This has to be done in GitHub repository settings or with `gh`.

- [x] Remove repository secret `W3_PRINCIPAL`.
- [x] Remove repository secret `W3_PROOF`.
- [x] Remove repository secret `WEB3STORAGE_TOKEN` if it exists.
- [x] Confirm remaining scrape secrets still exist:
  - [x] `GOODREADS_KEY`
  - [x] `GOODREADS_USER`
  - [ ] Any additional Goodreads login secrets used by the active scraper.
- [x] Run the GitHub Actions workflow manually after cleanup and confirm it passes.

## Verification

- [ ] Search tracked source/docs for leftover pinning references without dumping ignored secret files.
  - [ ] `rg -n "ipfs|IPFS|storacha|Storacha|web3|web3.storage|w3cli|W3_PRINCIPAL|W3_PROOF|WEB3STORAGE|goodreads-ipfs|apps/pin|pin-sh" . --glob '!secrets/*' --glob '!node_modules/*' --glob '!data/*'`
  - [ ] Review any remaining hits and confirm they are intentional historical notes or unrelated text.
- [x] Check tracked files only for dependency and workflow leftovers.
  - [x] `git grep -n -E "web3.storage|@web3-storage|ipfs-car|w3cli|W3_PRINCIPAL|W3_PROOF|WEB3STORAGE|goodreads-ipfs|apps/pin|pin-sh"`
- [ ] Check lines of code/package footprint changed as expected.
  - [ ] `git diff --stat`
  - [ ] `git diff -- .github/workflows/scrape.yml package.json pnpm-lock.yaml pnpm-workspace.yaml README.md secrets/README.md`
- [x] `pnpm test`
  - Note: passed in user shell; Codex runner hangs/fails before pnpm runs project tests.
- [x] `pnpm lint`
  - Note: passed in user shell; Codex runner hangs/fails before pnpm runs project lint.
- [ ] `git status --short`
- [ ] Confirm no ignored secret file contents were accidentally staged.
- [x] Confirm CI passes on GitHub after merging or pushing the cleanup branch.

## Optional Follow-Up

- [ ] If publishing to local IPFS becomes useful later, create a new small app such as `apps/ipfs-publish`.
  - [ ] Prefer `ipfs add --cid-version=1 --wrap-with-directory goodreads-rss.json goodreads-rss-ng.json goodreads-rss-ng-progress.json`.
  - [ ] Write a new manifest with neutral names such as `cid`, `gatewayBaseUrl`, and `files`.
  - [ ] Avoid Storacha/web3.storage-specific concepts: spaces, proofs, shards, `w3s.link`, `w3 up`, and `w3 rm`.
