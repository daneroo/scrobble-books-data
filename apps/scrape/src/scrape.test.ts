/** The entry point, run as `bun run scrape` would; none of these reach Goodreads. */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ENTRY = join(import.meta.dir, "scrape.ts");

/** Runs the entry point with `args` and no credentials. */
async function scrape(...args: string[]) {
  const proc = Bun.spawn(["bun", ENTRY, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "" },
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

describe("bun run scrape", () => {
  test("--help documents every option, and what --rate means", async () => {
    const { code, stdout } = await scrape("--help");
    expect(code).toBe(0);
    for (const option of [
      "--concurrency N",
      "-c,",
      "--rate R|none",
      "--interactive",
      "--cached",
      "--help",
    ])
      expect(stdout).toContain(option);
    expect(stdout.replace(/\s+/g, " ")).toContain(
      "--rate R|none The maximum number of requests started per second",
    );
  });

  test.each([
    [["--rate", "fast"], "--rate"],
    [["-c", "0"], "--concurrency"],
    [["--bogus"], "--bogus"],
  ])("%p is bad-config, exit 1, before any login", async (args, named) => {
    const { code, stderr } = await scrape(...args);
    expect(code).toBe(1);
    expect(stderr).toContain("FAIL: setup bad-config");
    expect(stderr).toContain(named);
  });

  test("every run starts with the settings in effect, defaults included", async () => {
    expect((await scrape()).stdout).toContain(
      "scrape: -c 3 --rate 6, --cached no, --interactive no",
    );
    expect(
      (await scrape("-c", "1", "--rate", "none", "--cached")).stdout,
    ).toContain("scrape: -c 1 --rate none, --cached yes, --interactive no");
  });

  test("missing credentials fail before any login", async () => {
    const { code, stderr } = await scrape();
    expect(code).toBe(1);
    expect(stderr).toContain("FAIL: setup missing-credentials");
  });
});
