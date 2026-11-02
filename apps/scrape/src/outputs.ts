import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ScrapeFailure } from "./failure.ts";
import type { Goodreads } from "./goodreads.ts";
import type { ListPage } from "./list/parse.ts";

/** The CUE schema for `goodreads.json` and the segments. */
export const GOODREADS_CUE = join(
  import.meta.dir,
  "../../../cue/check-goodreads.cue",
);

/** Where a run keeps its local files, under the gitignored data directory. */
export function runFiles(dataDir: string) {
  return {
    /** One segment per list page: `list-p01.json`, … */
    segments: join(dataDir, "segments"),
    /** The raw list pages, as fetched (X3). */
    pages: join(dataDir, "pages"),
    /** `goodreads.json`, before CUE passes and it is published. */
    staged: join(dataDir, "goodreads.json"),
  };
}

/** Empties the run's local files, so nothing is left from an earlier run. */
export async function resetRunFiles(dataDir: string): Promise<void> {
  const files = runFiles(dataDir);
  await rm(files.segments, { recursive: true, force: true });
  await rm(files.pages, { recursive: true, force: true });
  await rm(files.staged, { force: true });
  await mkdir(files.segments, { recursive: true });
  await mkdir(files.pages, { recursive: true });
}

/** `list-p01.json`, … sorted in page order. */
export function segmentName(page: number, extension = "json"): string {
  return `list-p${String(page).padStart(2, "0")}.${extension}`;
}

/** Deterministic (S8): 2-space JSON, as the published files have always been. */
function serialize(value: Goodreads): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Writes the segments and `goodreads.json` to the data directory, runs CUE
 * on all of them (X5), and only then moves `goodreads.json` into place (X2).
 * A CUE failure throws a `cue-failure` and publishes nothing.
 */
export async function writeOutputs(options: {
  goodreads: Goodreads;
  pages: readonly ListPage[];
  dataDir: string;
  publishPath: string;
  cueSchema?: string;
  /** Once aborted (the run deadline), nothing is published. */
  signal?: AbortSignal;
}): Promise<void> {
  const { goodreads, pages, dataDir, publishPath } = options;
  const { cueSchema = GOODREADS_CUE } = options;
  const files = runFiles(dataDir);
  const segmentPaths = pages.map((page) =>
    join(files.segments, segmentName(page.page)),
  );
  await Promise.all(
    pages.map((page, i) =>
      Bun.write(
        segmentPaths[i]!,
        serialize({ userFullName: goodreads.userFullName, items: page.items }),
      ),
    ),
  );
  await Bun.write(files.staged, serialize(goodreads));

  await vet(cueSchema, [files.staged, ...segmentPaths]);
  options.signal?.throwIfAborted();

  await mkdir(dirname(publishPath), { recursive: true });
  const temp = `${publishPath}.tmp`;
  await Bun.write(temp, await Bun.file(files.staged).text());
  await rename(temp, publishPath);
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
