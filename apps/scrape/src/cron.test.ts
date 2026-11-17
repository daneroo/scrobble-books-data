/**
 * The entry point, `bun run cron`: when it starts a child scrape, what it
 * prints, and how it stops. The schedule fires by hand, children are fakes,
 * time is set by the test: no test waits or starts a scrape.
 */
import { describe, expect, test } from "bun:test";

import { main, type Child, type CronDeps } from "./cron.ts";

/** A child scrape the test ends, and the signals it was sent. */
interface FakeChild extends Child {
  argv: string[];
  cwd: string;
  signals: string[];
  /** Prints a line, as the child's stdout. */
  say(line: string): void;
  end(code: number): void;
}

function harness(args: string[]) {
  const lines: string[] = [];
  const children: FakeChild[] = [];
  let fire: (() => void) | undefined;
  let scheduled = 0;
  let stopped = 0;
  let clock = new Date("2026-11-16T15:30:00Z");
  const stop = new AbortController();
  const deps: CronDeps = {
    root: "/repo",
    now: () => clock,
    print: (line) => lines.push(line),
    stop: stop.signal,
    schedule: (onFire) => {
      scheduled++;
      fire = onFire;
      return () => {
        stopped++;
        fire = undefined;
      };
    },
    spawn: (argv, { cwd, onLine }) => {
      let end: (code: number) => void = () => undefined;
      const exited = new Promise<number>((resolve) => (end = resolve));
      const child: FakeChild = {
        argv,
        cwd,
        signals: [],
        exited,
        kill: (signal) => child.signals.push(signal),
        say: (line) => onLine(line, "out"),
        end: (code) => end(code),
      };
      children.push(child);
      return child;
    },
  };
  const running = main(args, deps);
  return {
    lines,
    children,
    running,
    get scheduled() {
      return scheduled;
    },
    get stopped() {
      return stopped;
    },
    /** A fire time, at `at`. */
    fire(at: string) {
      clock = new Date(at);
      if (fire === undefined) throw new Error("no schedule");
      fire();
    },
    at(time: string) {
      clock = new Date(time);
    },
    terminate: () => stop.abort(),
  };
}

/** Lets the promise callbacks queued so far run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("bun run cron", () => {
  test("starts no run at start, and names the schedule and the next run", async () => {
    const cron = harness(["--publish"]);
    await settle();
    expect(cron.scheduled).toBe(1);
    expect(cron.children).toHaveLength(0);
    expect(cron.lines).toEqual([
      "2026-11-16T15:30:00Z cron: schedule 4 */2 * * * (UTC): bun run scrape --publish; next run 2026-11-16T16:04:00Z",
    ]);
    cron.terminate();
    expect(await cron.running).toBe(0);
  });

  test("each fire time runs one child scrape with the same flags, passes its stdout through, and reports its end", async () => {
    const cron = harness(["--publish", "-c", "2"]);
    await settle();
    cron.fire("2026-11-16T16:04:00Z");
    expect(cron.children).toHaveLength(1);
    const [child] = cron.children;
    expect(child!.argv).toEqual([
      "bun",
      "run",
      "scrape",
      "--publish",
      "-c",
      "2",
    ]);
    expect(child!.cwd).toBe("/repo");
    child!.say("2026-11-16T16:10:00Z review  372/1457   5.8/s");
    child!.say("log: /repo/data/logs/scrape-until-2026-11-16T16-25-30Z.log");
    cron.at("2026-11-16T16:25:34Z");
    child!.end(0);
    await settle();
    expect(cron.lines.slice(1)).toEqual([
      "2026-11-16T16:04:00Z cron: run started: bun run scrape --publish -c 2",
      "2026-11-16T16:10:00Z review  372/1457   5.8/s",
      "log: /repo/data/logs/scrape-until-2026-11-16T16-25-30Z.log",
      "2026-11-16T16:25:34Z cron: run ended: exit 0 after 21m 34s; log: /repo/data/logs/scrape-until-2026-11-16T16-25-30Z.log; next run 2026-11-16T18:04:00Z",
    ]);

    // the next fire time runs the next child
    cron.fire("2026-11-16T18:04:00Z");
    expect(cron.children).toHaveLength(2);
    cron.children[1]!.end(1);
    await settle();
    expect(cron.lines.at(-1)).toBe(
      "2026-11-16T18:04:00Z cron: run ended: exit 1 after 0m 00s; log: none; next run 2026-11-16T20:04:00Z",
    );
    cron.terminate();
    expect(await cron.running).toBe(0);
  });

  test("a fire time during a run is skipped and logged", async () => {
    const cron = harness([]);
    await settle();
    cron.fire("2026-11-16T16:04:00Z");
    cron.fire("2026-11-16T18:04:00Z");
    expect(cron.children).toHaveLength(1);
    expect(cron.lines.at(-1)).toBe(
      "2026-11-16T18:04:00Z cron: skipped: the run started 2026-11-16T16:04:00Z is still going; next run 2026-11-16T20:04:00Z",
    );
    cron.at("2026-11-16T18:30:00Z");
    cron.children[0]!.end(0);
    await settle();
    expect(cron.lines.at(-1)).toContain(
      "cron: run ended: exit 0 after 2h 26m 00s",
    );
    cron.fire("2026-11-16T20:04:00Z");
    expect(cron.children).toHaveLength(2);
    cron.terminate();
  });

  test("SIGTERM stops the schedule, signals the child, and exits once it ends", async () => {
    const cron = harness(["--publish"]);
    await settle();
    cron.fire("2026-11-16T16:04:00Z");
    const [child] = cron.children;
    cron.at("2026-11-16T16:05:00Z");
    cron.terminate();
    await settle();
    expect(cron.stopped).toBe(1);
    expect(child!.signals).toEqual(["SIGTERM"]);
    child!.end(143);
    expect(await cron.running).toBe(0);
    expect(cron.lines.slice(-3)).toEqual([
      "2026-11-16T16:05:00Z cron: stopping: SIGTERM to the run started 2026-11-16T16:04:00Z",
      "2026-11-16T16:05:00Z cron: run ended: exit 143 after 1m 00s; log: none",
      "2026-11-16T16:05:00Z cron: stopped",
    ]);
  });

  test("--help prints generated help and starts no schedule", async () => {
    const cron = harness(["--help"]);
    expect(await cron.running).toBe(0);
    expect(cron.scheduled).toBe(0);
    const help = cron.lines.join("\n");
    expect(help).toStartWith("bun run cron [options]");
    for (const option of [
      "--publish",
      "--save-pages",
      "-c, --concurrency",
      "--rate",
    ])
      expect(help).toContain(option);
    expect(help).toContain("4 */2 * * *");
  });

  test.each([[["--bogus"]], [["--rate", "fast"]]])(
    "%p fails, exit 1, and starts no schedule",
    async (args) => {
      const cron = harness(args);
      expect(await cron.running).toBe(1);
      expect(cron.scheduled).toBe(0);
      expect(cron.lines.join("\n")).toContain("see --help");
    },
  );
});
