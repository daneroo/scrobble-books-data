// velociraptor runner file
// vr depcheck
// vr git_log
export default {
  scripts: {
    depcheck:
      "deno run --allow-net --allow-read --allow-write --unstable https://deno.land/x/depcheck/mod.ts",
    udd:
      "deno run --allow-read=. --allow-write=. --allow-net https://deno.land/x/udd/main.ts src/deps.ts",
    git_log:
      "git log|grep 'Latest book data' | cut -c22-31 | uniq -c |head -n 10 && echo 'git pull?'",
  },
};
