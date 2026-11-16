/**
 * The entry point, `bun run scrape`: a whole run, its restarts, what it
 * leaves on disk, its log, and the `--publish` git steps. None of these
 * reach Goodreads: pages come from the fake Goodreads, the session is a
 * stub, git runs on temporary repositories, time is a virtual clock.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VirtualClock } from "./flow/virtual-clock.ts";
import type { Goodreads } from "./goodreads.ts";
import type { SessionResult } from "./login/login.ts";
import { main } from "./scrape.ts";
import {
  fakeGoodreads,
  FIXTURE_USER,
  savedRows,
  SAVED_REVIEWS,
  type FakeGoodreads,
} from "./testing/fake-goodreads.ts";

const ENTRY = join(import.meta.dir, "scrape.ts");
/** _Debt_'s book id: its book page is the one challenged below. */
const DEBT_BOOK = "6617037";
const NOW = new Date("2026-11-14T12:00:00Z");

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "scrape-main-test-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/** The saved list page's 100 books: one list page, real shelves. */
const oneListPage = () => fakeGoodreads([...savedRows]);

/**
 * Runs `bun run scrape args` in-process on `root`, against `fake`, with a
 * stub session; `sessions` counts the passes that read it.
 */
async function scrape(
  root: string,
  fake: FakeGoodreads | undefined,
  args: string[],
  options: { user?: string; session?: () => Promise<SessionResult> } = {},
) {
  const clock = new VirtualClock();
  const lines: string[] = [];
  let sessions = 0;
  const session =
    options.session ??
    (async (): Promise<SessionResult> => ({
      ok: true,
      cookie: "session=abc123",
      userAgent: "Mozilla/5.0 Chrome",
    }));
  const code = await clock.settle(
    main(args, {
      root,
      env: { GOODREADS_USER: options.user ?? FIXTURE_USER },
      session: () => {
        sessions++;
        return session();
      },
      fetch: fake?.fetch,
      clock,
      random: () => 0.5,
      now: () => NOW,
      print: (line) => lines.push(line),
    }),
  );
  const logs = join(root, "data", "logs");
  const logName = `scrape-until-${NOW.toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-")}.log`;
  return {
    code,
    lines,
    text: lines.join("\n"),
    sessions,
    elapsedMs: clock.now(),
    log: async () => await Bun.file(join(logs, logName)).text(),
    logName,
  };
}

const published = async (root: string) =>
  (await Bun.file(join(root, "goodreads.json")).json()) as Goodreads;

describe("bun run scrape", () => {
  test("--help prints generated help: every option, and what --rate means", async () => {
    const proc = Bun.spawn(["bun", ENTRY, "--help"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env.PATH ?? "" },
    });
    const [code, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
    ]);
    expect(code).toBe(0);
    expect(stdout).toStartWith("bun run scrape [options]");
    for (const option of [
      "--publish",
      "--save-pages",
      "-c, --concurrency",
      "--rate",
      "-h, --help",
      "[boolean]",
    ])
      expect(stdout).toContain(option);
    expect(stdout).not.toContain("--cached");
    expect(stdout.replace(/\s+/g, " ")).toContain(
      "The maximum number of requests started per second",
    );
    // no run: no log
    expect(stdout).not.toContain("scrape: -c");
  });

  test.each([
    [["--rate", "fast"], "--rate"],
    [["-c", "0"], "--concurrency"],
    [["--rate"], "rate"],
    [["--bogus"], "bogus"],
    [["--cached"], "cached"],
    [["extra"], "extra"],
  ])("%p is bad-config, exit 1, before any session", async (args, named) => {
    const { code, text, sessions } = await scrape(tmp, undefined, args);
    expect(code).toBe(1);
    expect(text).toContain("FAIL: setup bad-config");
    expect(text).toContain(named);
    expect(text).toContain("see --help");
    expect(sessions).toBe(0);
  });

  test("every run starts with the settings in effect, defaults included", async () => {
    const plain = await scrape(tmp, undefined, [], { user: "" });
    expect(plain.text).toContain(
      "scrape: -c 3 --rate 6, --publish no, --save-pages no",
    );
    const set = await scrape(
      tmp,
      undefined,
      ["-c", "1", "--rate", "none", "--save-pages"],
      { user: "" },
    );
    expect(set.text).toContain(
      "scrape: -c 1 --rate none, --publish no, --save-pages yes",
    );
  });

  test("missing credentials fail before any session", async () => {
    const { code, text, sessions } = await scrape(tmp, undefined, [], {
      user: "",
    });
    expect(code).toBe(1);
    expect(text).toContain("FAIL: setup missing-credentials");
    expect(sessions).toBe(0);
  });
});

describe("stdout", () => {
  test("shows each batch's progress at most every 10 s, stage first, padded; the log has every request", async () => {
    // 1 request/s: the 100 review pages take 100 s
    const run = await scrape(tmp, oneListPage(), ["-c", "1", "--rate", "1"]);
    expect(run.code).toBe(0);
    const review = run.lines.filter((line) => /^\S+Z review /.test(line));
    // the count padded for 1457/1457, the rate for 99.9/s
    expect(review[0]).toBe("2026-11-14T12:00:00Z review    11/100   1.0/s");
    expect(review.map((line) => line.split(/\s+/)[2])).toEqual([
      "11/100",
      "21/100",
      "31/100",
      "41/100",
      "51/100",
      "61/100",
      "71/100",
      "81/100",
      "91/100",
    ]);
    expect(run.lines.filter((line) => /^\S+Z book /.test(line))).toHaveLength(
      9,
    );
    // no per-request line on stdout, but every one in the log
    expect(run.text).not.toContain("review pages: 1/100");
    const log = await run.log();
    expect(log).toContain("review pages: 1/100");
    expect(log).toContain("review pages: 100/100");
    for (const line of run.lines.slice(0, -1)) expect(log).toContain(line);
    // the batch's end still shows
    expect(run.text).toContain("review pages: 100 requests in");
  });
});

describe("restarts", () => {
  test("a pass that fails on a 202 restarts after 60 s, from the pages saved so far", async () => {
    let pass = 0;
    const fake = fakeGoodreads([...savedRows], {
      book: (row) =>
        pass === 1 && row.bookId === DEBT_BOOK
          ? new Response("", { status: 202 })
          : undefined,
    });
    const run = await scrape(tmp, fake, ["-c", "1", "--rate", "none"], {
      session: async () => {
        pass++;
        return { ok: true, cookie: "session=abc123", userAgent: "UA" };
      },
    });

    expect(run.code).toBe(0);
    expect(run.sessions).toBe(2);
    expect(run.text).toContain(
      "pass 1 failed: book-pages waf-challenge: /book/show/6617037",
    );
    expect(run.text).toContain("restart 1/100 in 60s");
    expect(run.text).toContain("pass 2: start");
    expect(run.text).toContain("restart: reading the pages saved in");
    expect(run.elapsedMs).toBeGreaterThanOrEqual(60_000);
    // every page once, but the challenged one: pass 2 read the rest back
    expect(fake.requests).toEqual([1]);
    expect(fake.reviewRequests).toHaveLength(100);
    expect(fake.bookRequests).toHaveLength(101);
    expect(fake.bookRequests.filter((id) => id === DEBT_BOOK)).toHaveLength(2);
    expect(await published(tmp)).toHaveLength(100);
    expect(run.text).toContain("run end: passed after 2 passes");
  });

  test("a pass that fails on too many retries (a 503, 6 attempts) restarts", async () => {
    let pass = 0;
    const fake = fakeGoodreads([...savedRows], {
      review: (row) =>
        pass === 1 && row.reviewId === SAVED_REVIEWS.debt
          ? new Response("", { status: 503 })
          : undefined,
    });
    const run = await scrape(tmp, fake, ["-c", "1", "--rate", "none"], {
      session: async () => {
        pass++;
        return { ok: true, cookie: "session=abc123", userAgent: "UA" };
      },
    });
    expect(run.code).toBe(0);
    expect(run.text).toContain("pass 1 failed: review-pages server-error");
    expect(run.text).toContain("restart 1/100 in 60s");
    expect(fake.requests).toEqual([1]);
    // 6 attempts in pass 1, then once more in pass 2
    expect(
      fake.reviewRequests.filter((id) => id === SAVED_REVIEWS.debt),
    ).toHaveLength(7);
  });

  test("a failure that is not temporary (layout-change) fails at once", async () => {
    const fake = fakeGoodreads([...savedRows], {
      override: () => new Response("<html></html>", { status: 200 }),
    });
    const run = await scrape(tmp, fake, []);
    expect(run.code).toBe(1);
    expect(run.sessions).toBe(1);
    expect(run.elapsedMs).toBeLessThan(60_000);
    expect(run.text).toContain("FAIL: list-pages layout-change");
    expect(run.text).toContain("pass 1 failed, not restarted");
    expect(await Bun.file(join(tmp, "goodreads.json")).exists()).toBe(false);
  });

  test("signed out fails at once", async () => {
    const run = await scrape(tmp, oneListPage(), [], {
      session: async () => ({
        ok: false,
        failure: { step: "login", mode: "signed-out", detail: "run login" },
      }),
    });
    expect(run.code).toBe(1);
    expect(run.sessions).toBe(1);
    expect(run.text).toContain("FAIL: login signed-out");
  });

  test("at most 100 restarts, then the run fails with the last failure", async () => {
    const fake = fakeGoodreads([...savedRows], {
      override: () => new Response("", { status: 202 }),
    });
    const run = await scrape(tmp, fake, []);
    expect(run.code).toBe(1);
    expect(run.sessions).toBe(101);
    expect(fake.requests).toHaveLength(101);
    expect(run.elapsedMs).toBe(100 * 60_000);
    expect(run.text).toContain("restart 100/100 in 60s");
    expect(run.text).toContain("pass 101 failed; no restart left (100)");
    expect(run.text).toContain("FAIL: list-pages waf-challenge");
  }, 30_000);
});

describe("on disk", () => {
  test("after a run, data/ holds only logs/: the pages and staged file are deleted", async () => {
    const run = await scrape(tmp, oneListPage(), []);
    expect(run.code).toBe(0);
    expect(await readdir(join(tmp, "data"))).toEqual(["logs"]);
    expect(await readdir(join(tmp, "data", "logs"))).toEqual([run.logName]);
  });

  test("after a failed run too", async () => {
    const fake = fakeGoodreads([...savedRows], {
      override: () => new Response("gone", { status: 404 }),
    });
    expect((await scrape(tmp, fake, [])).code).toBe(1);
    expect(await readdir(join(tmp, "data"))).toEqual(["logs"]);
  });

  test("--save-pages keeps the raw pages, and only them", async () => {
    const run = await scrape(tmp, oneListPage(), ["--save-pages"]);
    expect(run.code).toBe(0);
    expect((await readdir(join(tmp, "data"))).sort()).toEqual([
      "logs",
      "scrape",
    ]);
    expect(await readdir(join(tmp, "data", "scrape"))).toEqual(["pages"]);
    // 1 list page, 100 review pages, 100 book pages
    expect(await readdir(join(tmp, "data", "scrape", "pages"))).toHaveLength(
      201,
    );
  });

  test("the log has every line printed, and only the last 100 logs are kept", async () => {
    const logs = join(tmp, "data", "logs");
    // 105 older logs, the oldest first
    const name = (i: number) => `old-${String(i).padStart(3, "0")}.log`;
    for (let i = 0; i < 105; i++) {
      const path = join(logs, name(i));
      await Bun.write(path, "old\n");
      const at = new Date(Date.UTC(2026, 0, 1, i));
      await utimes(path, at, at);
    }
    const run = await scrape(tmp, oneListPage(), []);
    expect(run.code).toBe(0);
    const kept = (await readdir(logs)).sort();
    expect(kept).toHaveLength(100);
    expect(kept).toContain(run.logName);
    // the 99 newest old ones stay
    expect(kept.filter((file) => file.startsWith("old-"))).toEqual(
      Array.from({ length: 99 }, (_, i) => name(i + 6)),
    );
    const log = await run.log();
    for (const line of run.lines.slice(0, -1)) expect(log).toContain(line);
    expect(log).toContain("PASS: 100 books");
  });

  test("a live log left by a run that did not end is archived as interrupted", async () => {
    const logs = join(tmp, "data", "logs");
    const live = join(logs, "scrape.log");
    await Bun.write(live, "pass 1: start\nreview pages: 12/100\n");
    const at = new Date("2026-11-14T10:30:00Z");
    await utimes(live, at, at);

    const run = await scrape(tmp, oneListPage(), []);
    expect(run.code).toBe(0);
    const archived = join(
      logs,
      "scrape-until-2026-11-14T10-30-00Z-interrupted.log",
    );
    expect(await Bun.file(archived).text()).toBe(
      "pass 1: start\nreview pages: 12/100\n",
    );
    expect((await readdir(logs)).sort()).toEqual([
      "scrape-until-2026-11-14T10-30-00Z-interrupted.log",
      run.logName,
    ]);
    expect(run.text).toContain(
      `log: archived a run that did not end: ${archived}`,
    );
  });

  test("the log never shows the user or the cookie", async () => {
    const run = await scrape(tmp, oneListPage(), []);
    const log = await run.log();
    expect(log).not.toContain(FIXTURE_USER);
    expect(log).not.toContain("abc123");
  });
});

describe("--publish", () => {
  /** Runs git in `cwd`; throws on failure. */
  async function git(cwd: string, ...args: string[]): Promise<string> {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (code !== 0) throw new Error(`git ${args.join(" ")}: ${stderr}`);
    return stdout.trim();
  }

  /** A clone of `remote`, set up to commit with no signing or hooks. */
  async function clone(remote: string, name: string): Promise<string> {
    const path = join(tmp, name);
    await git(tmp, "clone", "--quiet", remote, path);
    await git(path, "config", "user.name", "Test");
    await git(path, "config", "user.email", "test@example.invalid");
    await git(path, "config", "commit.gpgsign", "false");
    await git(path, "config", "core.hooksPath", "/dev/null");
    return path;
  }

  /**
   * A bare remote on `main`, with `goodreads.json` and a `.gitignore` of
   * `data/`, as the repo has; `seed` pushes to it, `root` is where the
   * scraper runs.
   */
  async function repos() {
    const remote = join(tmp, "remote.git");
    await git(tmp, "init", "--quiet", "--bare", "-b", "main", remote);
    const seed = await clone(remote, "seed");
    await git(seed, "checkout", "--quiet", "-b", "main");
    await Bun.write(join(seed, ".gitignore"), "data/\n");
    await Bun.write(join(seed, "goodreads.json"), "[]\n");
    await git(seed, "add", ".");
    await git(seed, "commit", "--quiet", "-m", "seed");
    await git(seed, "push", "--quiet", "-u", "origin", "main");
    const root = await clone(remote, "root");
    return { remote, seed, root };
  }

  const subjects = async (repo: string) =>
    (await git(repo, "log", "--format=%s", "main")).split("\n");

  test("refuses to run off main: no session, no request, no commit", async () => {
    const { remote, root } = await repos();
    await git(root, "checkout", "--quiet", "-b", "other");
    const fake = oneListPage();
    const run = await scrape(root, fake, ["--publish"]);
    expect(run.code).toBe(1);
    expect(run.text).toContain("publish: on 'other', not main; stopping");
    expect(run.sessions).toBe(0);
    expect(fake.requests).toEqual([]);
    expect(await subjects(remote)).toEqual(["seed"]);
  });

  test("refuses a tree that is not clean", async () => {
    const { root } = await repos();
    await Bun.write(join(root, "stray.txt"), "x");
    const run = await scrape(root, oneListPage(), ["--publish"]);
    expect(run.code).toBe(1);
    expect(run.text).toContain(
      "publish: the working tree is not clean; stopping",
    );
    expect(run.sessions).toBe(0);
  });

  test("pulls, scrapes, commits goodreads.json alone, and pushes", async () => {
    const { remote, seed, root } = await repos();
    // a commit the scraper's clone doesn't have yet
    await Bun.write(join(seed, "NOTE.md"), "note\n");
    await git(seed, "add", "NOTE.md");
    await git(seed, "commit", "--quiet", "-m", "note");
    await git(seed, "push", "--quiet");

    const run = await scrape(root, oneListPage(), ["--publish"]);
    expect(run.code).toBe(0);
    expect(await Bun.file(join(root, "NOTE.md")).exists()).toBe(true);
    expect(await subjects(remote)).toEqual([
      "Latest book data 2026-11-14T12:00:00Z",
      "note",
      "seed",
    ]);
    expect(
      await git(remote, "show", "--name-only", "--format=", "main"),
    ).toEqual("goodreads.json");
    expect(await published(root)).toHaveLength(100);
    expect(run.text).toContain(
      "run end: passed after 1 pass; publish: committed and pushed",
    );
    // the log stays out of git: data/ is ignored
    expect(await git(root, "status", "--porcelain")).toBe("");
  });

  test("commits nothing when goodreads.json did not change", async () => {
    const { remote, root } = await repos();
    expect((await scrape(root, oneListPage(), ["--publish"])).code).toBe(0);
    const again = await scrape(root, oneListPage(), ["--publish"]);
    expect(again.code).toBe(0);
    expect(again.text).toContain("publish: nothing changed");
    expect(await subjects(remote)).toEqual([
      "Latest book data 2026-11-14T12:00:00Z",
      "seed",
    ]);
  });

  test("a failed run commits nothing", async () => {
    const { remote, root } = await repos();
    const fake = fakeGoodreads([...savedRows], {
      override: () => new Response("gone", { status: 404 }),
    });
    const run = await scrape(root, fake, ["--publish"]);
    expect(run.code).toBe(1);
    expect(await subjects(remote)).toEqual(["seed"]);
    expect(await git(root, "status", "--porcelain")).toBe("");
  });
});
