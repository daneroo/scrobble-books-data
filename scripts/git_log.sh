#!/usr/bin/env bash

# look at the latests commits
# count selected commits by day
git log|grep 'Latest book data' | cut -c22-31 | uniq -c |head -n 10 && echo 'git pull?'

# $ ./scripts/git_log.sh 
#    1 2022-11-23
#    5 2022-11-22
#    5 2022-11-21
#   12 2022-11-20
#    5 2022-11-19
