import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { toCompat, type Compat } from "./compat/mapping.ts";
import { ScrapeFailure } from "./failure.ts";
import type { Goodreads, Item } from "./goodreads.ts";

/** The CUE schema for `goodreads.json` and the segments. */
export const GOODREADS_CUE = join(
  import.meta.dir,
  "../../../cue/check-goodreads.cue",
);

/** The CUE schema for `goodreads-rss.json`, the compatibility file. */
export const COMPAT_CUE = join(
  import.meta.dir,
  "../../../cue/check-output.cue",
);

/** `goodreads-rss.json`, published next to `goodreads.json`. */
export function compatPath(publishPath: string): string {
  return join(dirname(publishPath), "goodreads-rss.json");
}

/** Where a run keeps its local files, under the gitignored data directory. */
export function runFiles(dataDir: string) {
  return {
    /** One segment per list page: `list-p01.json`, … */
    segments: join(dataDir, "segments"),
    /** The raw list and review pages, as fetched (X3). */
    pages: join(dataDir, "pages"),
    /** `goodreads.json`, before CUE passes and it is published. */
    staged: join(dataDir, "goodreads.json"),
    /** `goodreads-rss.json`, likewise. */
    stagedCompat: join(dataDir, "goodreads-rss.json"),
  };
}

/**
 * Empties the run's local files, so nothing is left from an earlier run;
 * with `keepPages` (`--cached`), the raw pages stay, to be read again.
 */
export async function resetRunFiles(
  dataDir: string,
  { keepPages = false } = {},
): Promise<void> {
  const files = runFiles(dataDir);
  await rm(files.segments, { recursive: true, force: true });
  if (!keepPages) await rm(files.pages, { recursive: true, force: true });
  await rm(files.staged, { force: true });
  await rm(files.stagedCompat, { force: true });
  await mkdir(files.segments, { recursive: true });
  await mkdir(files.pages, { recursive: true });
}

/** `list-p01.json`, … sorted in page order. */
export function segmentName(page: number): string {
  return `list-p${String(page).padStart(2, "0")}.json`;
}

/** Deterministic (S8): 2-space JSON, as the published files have always been. */
function serialize(value: Goodreads | Compat): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Writes the segments, `goodreads.json` and `goodreads-rss.json` (the
 * compatibility mapping of `goodreads.json`) to the data directory, runs CUE
 * on all of them (X5), and only then moves the two files into place (X2).
 * A CUE failure throws a `cue-failure` and publishes nothing.
 */
export async function writeOutputs(options: {
  goodreads: Goodreads;
  /** One per list page: its books, with their progress. */
  segments: readonly { page: number; items: Item[] }[];
  dataDir: string;
  publishPath: string;
  cueSchema?: string;
  /** Once aborted (the run deadline), nothing is published. */
  signal?: AbortSignal;
}): Promise<void> {
  const { goodreads, segments, dataDir, publishPath } = options;
  const { cueSchema = GOODREADS_CUE } = options;
  const files = runFiles(dataDir);
  const segmentPaths = segments.map((segment) =>
    join(files.segments, segmentName(segment.page)),
  );
  await Promise.all(
    segments.map((segment, i) =>
      Bun.write(
        segmentPaths[i]!,
        serialize({
          userFullName: goodreads.userFullName,
          items: segment.items,
        }),
      ),
    ),
  );
  await Bun.write(files.staged, serialize(goodreads));
  await Bun.write(files.stagedCompat, serialize(toCompat(goodreads)));

  await vet(cueSchema, [files.staged, ...segmentPaths]);
  await vet(COMPAT_CUE, [files.stagedCompat]);
  options.signal?.throwIfAborted();

  await mkdir(dirname(publishPath), { recursive: true });
  await publish(files.staged, publishPath);
  await publish(files.stagedCompat, compatPath(publishPath));
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
