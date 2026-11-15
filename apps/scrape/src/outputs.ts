import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ScrapeFailure } from "./failure.ts";
import type { Goodreads } from "./goodreads.ts";

/** The CUE schema for `goodreads.json`. */
export const GOODREADS_CUE = join(
  import.meta.dir,
  "../../../cue/check-goodreads.cue",
);

/** Where a run keeps its local files, under the gitignored data directory. */
export function runFiles(dataDir: string) {
  return {
    /**
     * The raw list, review and book pages, as fetched (X3): a restart reads
     * them back. Deleted at the end of the run, unless `--save-pages`.
     */
    pages: join(dataDir, "pages"),
    /** `goodreads.json`, before CUE passes and it is published. */
    staged: join(dataDir, "goodreads.json"),
  };
}

/**
 * Readies the data directory for a pass. The first pass of a run starts
 * empty; a restart (`keepPages`) keeps the pages saved so far, to read them
 * again.
 */
export async function resetRunFiles(
  dataDir: string,
  { keepPages = false } = {},
): Promise<void> {
  const files = runFiles(dataDir);
  if (!keepPages) await rm(files.pages, { recursive: true, force: true });
  await rm(files.staged, { force: true });
  await mkdir(files.pages, { recursive: true });
}

/**
 * At the end of a run: deletes the data directory, so `data/` holds only
 * the logs; with `savePages` (`--save-pages`), the raw pages stay.
 */
export async function removeRunFiles(
  dataDir: string,
  { savePages = false } = {},
): Promise<void> {
  if (!savePages) {
    await rm(dataDir, { recursive: true, force: true });
    return;
  }
  await rm(runFiles(dataDir).staged, { force: true });
}

/** Deterministic (S8): 2-space JSON, as the published files have always been. */
function serialize(value: Goodreads): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Writes `goodreads.json` to the data directory, runs CUE on it (X5), and
 * only then moves it into place (X2); the staged copy is then deleted. A CUE
 * failure throws a `cue-failure` and publishes nothing.
 */
export async function writeOutputs(options: {
  goodreads: Goodreads;
  dataDir: string;
  publishPath: string;
  cueSchema?: string;
  /** Once aborted (the pass deadline), nothing is published. */
  signal?: AbortSignal;
}): Promise<void> {
  const { goodreads, dataDir, publishPath } = options;
  const { cueSchema = GOODREADS_CUE } = options;
  const { staged } = runFiles(dataDir);
  await Bun.write(staged, serialize(goodreads));

  await vet(cueSchema, [staged]);
  options.signal?.throwIfAborted();

  await mkdir(dirname(publishPath), { recursive: true });
  await publish(staged, publishPath);
  await rm(staged, { force: true });
}

/** Copies `staged` to `path` through a temporary file and a rename. */
async function publish(staged: string, path: string): Promise<void> {
  const temp = `${path}.tmp`;
  await Bun.write(temp, await Bun.file(staged).text());
  await rename(temp, path);
}

/** Runs `cue vet` on each file against the schema. */
async function vet(schema: string, files: readonly string[]): Promise<void> {
  let proc;
  try {
    proc = Bun.spawn(["cue", "vet", schema, ...files], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new ScrapeFailure({
      step: "outputs",
      mode: "cue-failure",
      detail: `could not run cue: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  const [code, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) {
    const lines = stderr.trim().split("\n");
    throw new ScrapeFailure({
      step: "outputs",
      mode: "cue-failure",
      detail:
        lines.slice(0, 10).join("\n") +
        (lines.length > 10 ? `\n… ${lines.length - 10} more lines` : ""),
    });
  }
}
