/**
 * The run's log, in `data/logs/`: every line printed is also written to
 * `scrape.log`, which is renamed `scrape-until-<end>.log` when the run ends.
 * A `scrape.log` left by a run that did not end is renamed
 * `scrape-until-<its last write>-interrupted.log` when the next run starts.
 * Only the last 100 logs are kept; the scraper deletes older ones.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * The logs kept in `data/logs/`, this run's included: about 8 days at a run
 * every two hours (#59).
 */
export const LOGS_KEPT = 100;

export interface RunLog {
  /** Prints a line to stdout, and writes it to the log. */
  out(line: string): void;
  /** Prints a line to stderr, and writes it to the log. */
  err(line: string): void;
  /** Writes a line to the log file only, not to stdout. */
  fileOnly(line: string): void;
  /**
   * Where the log of a run that did not end was archived, when this run
   * found one; `undefined` otherwise.
   */
  interrupted: string | undefined;
  /**
   * Ends the log: renames it with the end time, deletes all but the last 100
   * logs, and prints (only) where the log is.
   */
  close(): Promise<void>;
}

export interface RunLogOptions {
  /** `data/logs/`. */
  dir: string;
  /** Wall-clock time, for the log's name. */
  now?: () => Date;
  /** Where lines are printed; by default, the console. */
  print?: Print;
}

/** Prints a line to stdout or stderr; tests collect them instead. */
export type Print = (line: string, stream: "out" | "err") => void;

export function openRunLog(options: RunLogOptions): RunLog {
  const { dir, now = () => new Date() } = options;
  const { print = printToConsole } = options;
  const live = join(dir, "scrape.log");
  mkdirSync(dir, { recursive: true });
  let interrupted: string | undefined;
  if (existsSync(live)) {
    const lastWrite = statSync(live).mtime;
    interrupted = join(
      dir,
      `scrape-until-${fileTime(lastWrite)}-interrupted.log`,
    );
    renameSync(live, interrupted);
  }
  appendFileSync(live, "");
  const fileOnly = (line: string) => appendFileSync(live, `${line}\n`);
  const write = (line: string, stream: "out" | "err") => {
    print(line, stream);
    fileOnly(line);
  };
  return {
    out: (line) => write(line, "out"),
    err: (line) => write(line, "err"),
    fileOnly,
    interrupted,
    async close() {
      const archived = join(dir, `scrape-until-${fileTime(now())}.log`);
      await rename(live, archived);
      await pruneLogs(dir);
      print(`log: ${archived}`, "out");
    },
  };
}

export function printToConsole(line: string, stream: "out" | "err"): void {
  (stream === "out" ? console.log : console.error)(line);
}

/** `2026-11-16T16:01:10Z`: an ISO time to the second. */
export function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d+Z$/, "Z");
}

/** `2026-11-14T23-42-13Z`: an ISO time, safe in a file name. */
function fileTime(date: Date): string {
  return stamp(date).replaceAll(":", "-");
}

/** Deletes every file in `dir` but the last 100, newest by modification time. */
export async function pruneLogs(dir: string): Promise<void> {
  const names = await readdir(dir);
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      mtimeMs: (await stat(join(dir, name))).mtimeMs,
    })),
  );
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  await Promise.all(
    files
      .slice(LOGS_KEPT)
      .map((file) =>
        rm(join(dir, file.name), { recursive: true, force: true }),
      ),
  );
}
