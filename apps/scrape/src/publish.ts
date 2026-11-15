/**
 * `--publish`: the git steps around the scrape, as `publish.sh` did them.
 * Before: on `main`, a clean tree, `git pull --ff-only`. After a passing
 * run: commit `goodreads.json` only if it changed, then push.
 */

/** Where git runs, and where its output goes. */
export interface GitOptions {
  /** The repository root. */
  root: string;
  log: (line: string) => void;
}

/** The output of one git command, every line logged. */
async function git(
  { root, log }: GitOptions,
  args: string[],
): Promise<{ ok: boolean; stdout: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  for (const line of `${stdout}${stderr}`.split("\n"))
    if (line.trim() !== "") log(`git ${args[0]}: ${line}`);
  return { ok: code === 0, stdout };
}

/**
 * Before the scrape: on `main`, with a clean tree, then pull. Returns why
 * it stops, or `undefined` to go on.
 */
export async function beforeScrape(
  options: GitOptions,
): Promise<string | undefined> {
  const branch = await git(options, ["branch", "--show-current"]);
  const name = branch.stdout.trim();
  if (!branch.ok || name !== "main") return `on '${name}', not main; stopping`;
  const status = await git(options, ["status", "--porcelain"]);
  if (!status.ok || status.stdout.trim() !== "")
    return "the working tree is not clean; stopping";
  if (!(await git(options, ["pull", "--ff-only"])).ok) return "git pull failed";
  return undefined;
}

/**
 * After a passing run: if `goodreads.json` changed, commits it alone as
 * "Latest book data <stamp>", then pushes.
 */
export async function afterScrape(
  options: GitOptions & { stamp: string },
): Promise<{ ok: boolean; result: string }> {
  const file = "goodreads.json";
  const status = await git(options, ["status", "--porcelain", "--", file]);
  if (!status.ok) return { ok: false, result: "git status failed" };
  if (status.stdout.trim() === "")
    return { ok: true, result: "nothing changed" };
  await git(options, ["diff", "--stat", "--", file]);
  const message = `Latest book data ${options.stamp}`;
  if (!(await git(options, ["commit", "-m", message, "--", file])).ok)
    return { ok: false, result: "commit failed" };
  if (!(await git(options, ["push"])).ok)
    return { ok: false, result: "committed, push failed" };
  return { ok: true, result: "committed and pushed" };
}
