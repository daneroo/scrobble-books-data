/**
 * The run's log, in `data/logs/`: every line printed is also written to
 * `scrape.log`, which is renamed `scrape-until-<end>.log` when the run ends.
 * Only the last 20 logs are kept; the scraper deletes older ones.
 */
import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/** The logs kept in `data/logs/`, this run's included (#51). */
export const LOGS_KEPT = 20;

export interface RunLog {
  /** Prints a line to stdout, and writes it to the log. */
  out(line: string): void;
  /** Prints a line to stderr, and writes it to the log. */
  err(line: string): void;
  /**
   * Ends the log: renames it with the end time, deletes all but the last 20
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
  print?: (line: string, stream: "out" | "err") => void;
}

export function openRunLog(options: RunLogOptions): RunLog {
  const { dir, now = () => new Date() } = options;
  const { print = printToConsole } = options;
  const live = join(dir, "scrape.log");
  mkdirSync(dir, { recursive: true });
  rmSync(live, { force: true });
  appendFileSync(live, "");
  const write = (line: string, stream: "out" | "err") => {
    print(line, stream);
    appendFileSync(live, `${line}\n`);
  };
  return {
    out: (line) => write(line, "out"),
    err: (line) => write(line, "err"),
    async close() {
      const archived = join(dir, `scrape-until-${fileTime(now())}.log`);
      await rename(live, archived);
      await pruneLogs(dir);
      print(`log: ${archived}`, "out");
    },
  };
}

function printToConsole(line: string, stream: "out" | "err"): void {
  (stream === "out" ? console.log : console.error)(line);
}

/** `2026-11-14T23-42-13Z`: an ISO time, safe in a file name. */
function fileTime(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");
}

/** Deletes every file in `dir` but the last 20, newest by modification time. */
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
