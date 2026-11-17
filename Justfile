# The scraper in Docker (infra/scrape/compose.yaml). Needs only docker and
# just on the host. Local, without Docker: the bun scripts in package.json.
# The container keeps its own browser profile and data, apart from local ones:
# infra/scrape/secrets/browser-profile/ and infra/scrape/data/.

compose := "docker compose -f infra/scrape/compose.yaml"

# the host user's IDs: the container writes its profile and data as them
export USER_ID := `id -u`
export GROUP_ID := `id -g`

# List the recipes
default:
    @just --list --unsorted
    @echo "Local, without Docker: bun run login, bun run publish (bun run scrape --help)"

# Build the image and start the scrape on its schedule (bun run cron --publish)
docker-start: mounts
    {{ compose }} up -d --build scrape

# Follow the scrape's output (each run's full log: infra/scrape/data/logs/)
docker-logs:
    {{ compose }} logs -f scrape

# Stop the scrape (a running scrape stops at once)
docker-stop:
    {{ compose }} stop scrape

# Sign in, when runs fail as signed-out: a desktop at port 5800, until Enter
docker-login: mounts
    #!/usr/bin/env bash
    set -euo pipefail
    {{ compose }} --profile login up -d --build login
    # stopped on Enter, Ctrl-C or any exit: never left running
    trap '{{ compose }} --profile login stop login' EXIT
    echo "Open http://$(hostname):5800, run bun run login in its terminal, sign in, close the browser."
    echo "The session is saved in infra/scrape/secrets/browser-profile/."
    read -r -p "Press Enter when done, to stop the desktop. " _

# What the services mount: the secrets must exist (else Docker creates root-owned
# directories in their place); the container's own profile and data are created
# as the host user
[private]
mounts:
    #!/usr/bin/env bash
    set -euo pipefail
    for f in secrets/GOODREADS.env secrets/S3.env; do
      [ -f "$f" ] || { echo "missing $f (see secrets/README.md)" >&2; exit 1; }
    done
    mkdir -p infra/scrape/secrets/browser-profile infra/scrape/data

# Check the image pins (tag@sha256) in apps/scrape/Dockerfile, and how to update
docker-pins:
    #!/usr/bin/env bash
    set -euo pipefail
    # Docker pulls by the sha256 and ignores the tag; the tag is the intent.
    # Each pin is checked against the sha256 its tag points to now.
    file=apps/scrape/Dockerfile
    while read -r pin; do
      tag="${pin%@*}"; pinned="${pin#*@}"
      current=$(docker buildx imagetools inspect "$tag" --format '{{{{json .Manifest.Digest}}' | tr -d '"')
      if [ "$current" = "$pinned" ]; then echo "same   $tag"; else echo "moved  $tag -> $tag@$current"; fi
    done < <(grep -oE '[a-z0-9./_-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}' "$file")
    echo
    echo "To update: in $file, replace a moved pin with the one shown, then run again."
    echo "To change version: edit the tag (e.g. a newer debian-13-v4.x.y), run again, paste the sha256 shown."
