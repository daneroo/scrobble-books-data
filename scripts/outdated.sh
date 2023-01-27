#!/usr/bin/env bash

# install or update udd
# deno install -rf --allow-read=. --allow-write=. --allow-net https://deno.land/x/udd/main.ts
# udd src/deps.ts

# or without installing udd
deno run --allow-read=. --allow-write=. --allow-net https://deno.land/x/udd/main.ts src/deps.ts
