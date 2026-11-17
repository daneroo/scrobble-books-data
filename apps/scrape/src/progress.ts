/**
 * Compact progress for stdout: one line per batch at most every 10 s, stage
 * first, padded to fixed widths, with the rate since its last line:
 *
 *     2026-11-16T16:01:10Z review  372/1457   5.8/s
 *
 * The per-request lines go to the log file only.
 */
import type { Clock } from "./flow/clock.ts";
import type { FlowEvent } from "./flow/flow.ts";
import { stamp } from "./logs.ts";

/** A batch's progress is printed at most this often. */
export const PROGRESS_INTERVAL_MS = 10_000;

type RequestEvent = Extract<FlowEvent, { type: "request" }>;

/**
 * Returns a function that takes each request event and returns the progress
 * line to print, or `undefined` while the batch's last line is under 10 s
 * old. A batch's first request starts its clock and prints nothing.
 */
export function progressLines(options: {
  /** Measures the 10 s and the rate; virtual in tests. */
  clock: Clock;
  /** Wall-clock time, for the stamp. */
  now: () => Date;
}): (event: RequestEvent) => string | undefined {
  const { clock, now } = options;
  const last = new Map<string, { atMs: number; done: number }>();
  return (event) => {
    const atMs = clock.now();
    const previous = last.get(event.batch);
    if (previous === undefined) {
      last.set(event.batch, { atMs, done: event.done });
      return undefined;
    }
    const elapsedMs = atMs - previous.atMs;
    if (elapsedMs < PROGRESS_INTERVAL_MS) return undefined;
    last.set(event.batch, { atMs, done: event.done });
    const rate = ((event.done - previous.done) * 1000) / elapsedMs;
    return [
      stamp(now()),
      stage(event.batch).padEnd(6),
      `${event.done}/${event.total}`.padStart(9),
      `${rate.toFixed(1)}/s`.padStart(7),
    ].join(" ");
  };
}

/** `review pages` → `review`, `list pages 2-15` → `list`. */
function stage(batch: string): string {
  return batch.split(" ")[0] ?? batch;
}
