/**
 * `bun run cron`: runs `bun run scrape`, with the same flags, as a child
 * process at minute 4 of every second hour, UTC. No run at start. A fire time
 * while a run is still going is skipped and logged: its only state is
 * whether a child is running. It prints a line when a run starts, is skipped
 * or ends, and passes the child's output through. On SIGTERM (or SIGINT) it
 * signals the child, waits for it to end, and exits.
 */
import { join } from "node:path";

import { parseCommand, SCRAPE_OPTIONS, type Command } from "./cli.ts";
import { flowSettings } from "./flow/settings.ts";
import { printToConsole, stamp, type Print } from "./logs.ts";

const ROOT = join(import.meta.dir, "../../..");

/** Minute 4 of every second hour; never on the hour. */
export const SCHEDULE = "4 */2 * * *";
const TZ = "UTC";

/** `bun run cron`, for `--help`. */
export const CRON: Command = {
  name: "bun run cron",
  description: `Runs bun run scrape, with the options given here, as a child process on the schedule ${SCHEDULE}, in UTC. No run at start. A fire time while a run is still going is skipped and logged. Prints a line when a run starts, is skipped or ends (exit code, duration, log file), and passes the run's output through. SIGTERM or SIGINT signals the run, waits for it to end, and exits.`,
  options: SCRAPE_OPTIONS,
  epilogue: "The options are bun run scrape's; see bun run scrape --help.",
};

/** A running child scrape. */
export interface Child {
  /** Resolves with the exit code. */
  exited: Promise<number>;
  kill(signal: "SIGTERM"): void;
}

/** What cron runs on; tests replace each one. */
export interface CronDeps {
  /** The repository root, where the child runs. */
  root: string;
  /** Calls `fire` at each fire time; returns a function that stops it. */
  schedule?: (fire: () => void) => () => void;
  /** Starts a child; each line of its output goes to `onLine`. */
  spawn?: (
    argv: string[],
    options: {
      cwd: string;
      onLine: (line: string, stream: "out" | "err") => void;
    },
  ) => Child;
  /** Wall-clock time. */
  now?: () => Date;
  print?: Print;
  /** Aborts on SIGTERM: stop the schedule, signal the child, return. */
  stop?: AbortSignal;
}

if (import.meta.main) {
  const stop = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => stop.abort());
  process.exitCode = await main(process.argv.slice(2), {
    root: ROOT,
    stop: stop.signal,
  });
}

/**
 * Runs `bun run cron` with `args`; resolves with the exit code once `stop`
 * aborts, or at once for `--help` or a bad option.
 */
export async function main(args: string[], deps: CronDeps): Promise<number> {
  const { root, schedule = cronSchedule, spawn = spawnChild } = deps;
  const { now = () => new Date(), print = printToConsole, stop } = deps;
  const parsed = await parseCommand(CRON, args);
  if (parsed.kind === "help") {
    print(parsed.text, "out");
    return 0;
  }
  try {
    if (parsed.kind === "error") throw new Error(parsed.message);
    flowSettings(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    print(`cron: ${message}; see --help`, "err");
    return 1;
  }

  const argv = ["bun", "run", "scrape", ...args];
  const command = argv.join(" ");
  const say = (line: string) => print(`${stamp(now())} cron: ${line}`, "out");
  const next = () => {
    const at = Bun.cron.parse(SCHEDULE, now(), { tz: TZ });
    return `next run ${at === null ? "none" : stamp(at)}`;
  };
  say(`schedule ${SCHEDULE} (UTC): ${command}; ${next()}`);

  /** The child running, if one is; only closures change it. */
  type Running = { child: Child; started: Date; ended: Promise<void> };
  let running = null as Running | null;
  let stopping = false;

  const fire = () => {
    if (running !== null) {
      say(
        `skipped: the run started ${stamp(running.started)} is still going; ${next()}`,
      );
      return;
    }
    const started = now();
    say(`run started: ${command}`);
    let log = "none";
    const child = spawn(argv, {
      cwd: root,
      onLine: (line, stream) => {
        const named = /^log: (?!archived )(.+)$/.exec(line);
        if (stream === "out" && named !== null) log = named[1]!;
        print(line, stream);
      },
    });
    const ended = child.exited.then((code) => {
      const took = duration(now().getTime() - started.getTime());
      const after = stopping ? "" : `; ${next()}`;
      say(`run ended: exit ${code} after ${took}; log: ${log}${after}`);
      running = null;
    });
    running = { child, started, ended };
  };

  const stopSchedule = schedule(fire);
  await new Promise<void>((resolve) => {
    if (stop === undefined) return;
    if (stop.aborted) resolve();
    stop.addEventListener("abort", () => resolve(), { once: true });
  });
  stopping = true;
  stopSchedule();
  const last = running;
  if (last !== null) {
    say(`stopping: SIGTERM to the run started ${stamp(last.started)}`);
    last.child.kill("SIGTERM");
    await last.ended;
  }
  say("stopped");
  return 0;
}

/** The fixed schedule, in-process, in UTC. */
function cronSchedule(fire: () => void): () => void {
  // returns at once: a fire time during a run must reach `fire` to be logged
  const job = Bun.cron(SCHEDULE, () => fire(), { tz: TZ });
  return () => job.stop();
}

/** `bun run scrape`, its output read line by line. */
function spawnChild(
  argv: string[],
  options: {
    cwd: string;
    onLine: (line: string, stream: "out" | "err") => void;
  },
): Child {
  const proc = Bun.spawn(argv, {
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const read = async (
    stream: ReadableStream<Uint8Array>,
    name: "out" | "err",
  ) => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of stream) {
      const lines = (rest + decoder.decode(chunk, { stream: true })).split(
        "\n",
      );
      rest = lines.pop() ?? "";
      for (const line of lines) options.onLine(line, name);
    }
    if (rest !== "") options.onLine(rest, name);
  };
  const output = Promise.all([
    read(proc.stdout, "out"),
    read(proc.stderr, "err"),
  ]);
  return {
    exited: (async () => {
      const code = await proc.exited;
      await output;
      return code;
    })(),
    kill: (signal) => proc.kill(signal),
  };
}

/** `21m 34s`, or `2h 26m 00s`. */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m ${s}s` : `${m}m ${s}s`;
}
