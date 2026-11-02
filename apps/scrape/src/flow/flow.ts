import { realClock, type Clock } from "./clock.ts";

/** How requests flow: how many at once, and how fast they start. */
export interface FlowSettings {
  /** Requests in flight at most; `1` is strictly sequential. */
  concurrency: number;
  /** Request starts per second at most; `null` is no cap. */
  ratePerSecond: number | null;
}

/** One request. It must stop when `signal` aborts. */
export interface Task<T> {
  /** Names the request in the log, e.g. its URL path. Never a secret. */
  label: string;
  run(signal: AbortSignal): Promise<T>;
}

/**
 * A failure worth retrying: a timeout, a network error, a 5xx or a 429.
 * Tasks throw it; any other error is fatal at once.
 */
export class TemporaryError extends Error {
  override name = "TemporaryError";
  /** How long the server asked us to wait (a `Retry-After`), if it did. */
  readonly retryAfterMs?: number;

  constructor(message: string, options: { retryAfterMs?: number } = {}) {
    super(message);
    this.retryAfterMs = options.retryAfterMs;
  }
}

/**
 * Failures the flow controller names itself. Each one ends the run.
 *
 * - `throttled`: Goodreads asked for a wait over 60 s, or the run spent its
 *   retry budget (R4, R5).
 * - `bad-config`: a malformed concurrency or rate setting (X7).
 */
export type FlowFailureMode = "throttled" | "bad-config";

export class FlowFailure extends Error {
  override name = "FlowFailure";

  constructor(
    readonly mode: FlowFailureMode,
    message: string,
  ) {
    super(message);
  }
}

/** Attempts per request, the first included. */
const MAX_ATTEMPTS = 4;
/** Backoff before the first retry; it doubles for each one after. */
const FIRST_BACKOFF_MS = 2000;
/** Each backoff varies by up to this fraction, either way. */
const JITTER = 0.25;
/** The longest `Retry-After` waited out; a longer one means stop. */
const MAX_RETRY_AFTER_MS = 60_000;
/** More retries than this in a run means we're being throttled. */
const MAX_RETRIES_PER_RUN = 20;
/** This many temporary failures in a row means we're being throttled. */
const MAX_FAILURES_IN_A_ROW = 5;

/** What the flow controller reports, for the log and for calibration. */
export type FlowEvent =
  | {
      /** A request succeeded. */
      type: "request";
      batch: string;
      label: string;
      /** The attempt that succeeded, from 1. */
      attempt: number;
      ms: number;
    }
  | {
      /** A request failed with a temporary error, and will be retried. */
      type: "retry";
      batch: string;
      label: string;
      /** The attempt that failed, from 1. */
      attempt: number;
      reason: string;
      delayMs: number;
    }
  | {
      /** A batch succeeded. */
      type: "batch";
      batch: string;
      requests: number;
      elapsedMs: number;
      /** Requests completed per second, over the whole batch. */
      ratePerSecond: number;
      retries: number;
      /** Of each request's successful attempt. */
      latencyMs: { p50: number; p95: number; p99: number };
    };

/** One log line per event. */
export function formatEvent(event: FlowEvent): string {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const millis = (ms: number) => `${Math.round(ms)}ms`;
  switch (event.type) {
    case "request": {
      const { batch, label, attempt, ms } = event;
      const retried = attempt > 1 ? ` (attempt ${attempt})` : "";
      return `${batch}: ${label} in ${millis(ms)}${retried}`;
    }
    case "retry": {
      const { batch, label, attempt, reason, delayMs } = event;
      return `${batch}: retry ${label} after attempt ${attempt}/${MAX_ATTEMPTS} (${reason}), waiting ${seconds(delayMs)}`;
    }
    case "batch": {
      const { batch, requests, elapsedMs, ratePerSecond, retries } = event;
      const { p50, p95, p99 } = event.latencyMs;
      return `${batch}: ${requests} requests in ${seconds(elapsedMs)} (${ratePerSecond.toFixed(2)}/s), ${retries} retries; latency p50 ${millis(p50)}, p95 ${millis(p95)}, p99 ${millis(p99)}`;
    }
  }
}

/** What the flow controller runs on; tests replace each one. */
export interface FlowDeps {
  clock?: Clock;
  /** In [0, 1); drives the backoff jitter. */
  random?: () => number;
  /** Receives every event; by default, logs it. */
  onEvent?: (event: FlowEvent) => void;
  /**
   * Ends the run from outside, e.g. the run deadline (T3): when it aborts,
   * the run stops as on a fatal error, with the signal's reason.
   */
  signal?: AbortSignal;
}

/** The one way requests reach Goodreads after login, for a whole run. */
export interface Flow {
  /**
   * Runs every task; resolves with their results in input order.
   *
   * The first fatal error ends the run: it aborts the tasks in flight (in
   * every batch), drops the ones not started, and rejects once nothing is
   * left running. Any later batch rejects at once with the same error.
   */
  batch<T>(name: string, tasks: readonly Task<T>[]): Promise<T[]>;
}

/**
 * The flow controller for one run. Concurrency, the rate cap and the retry
 * budget hold across all of its batches.
 *
 * Throws a `bad-config` FlowFailure for settings out of range.
 */
export function createFlow(settings: FlowSettings, deps: FlowDeps = {}): Flow {
  checkSettings(settings);
  const {
    clock = realClock,
    random = Math.random,
    onEvent = (event) => console.log(formatEvent(event)),
  } = deps;
  const intervalMs =
    settings.ratePerSecond === null ? 0 : 1000 / settings.ratePerSecond;
  // aborted, with the error, by the run's first fatal error
  const run = new AbortController();
  const { signal: outside } = deps;
  if (outside?.aborted) run.abort(outside.reason);
  outside?.addEventListener("abort", () => run.abort(outside.reason), {
    once: true,
  });
  // when the next request may start
  let nextStartMs = -Infinity;
  // the retry budget
  let retries = 0;
  let failuresInARow = 0;

  /** Waits for this request's turn under the rate cap. */
  async function paced(): Promise<void> {
    const nowMs = clock.now();
    const atMs = Math.max(nowMs, nextStartMs);
    nextStartMs = atMs + intervalMs;
    if (atMs > nowMs) await clock.sleep(atMs - nowMs, run.signal);
  }

  /** Runs a task's attempts until one succeeds or one is fatal. */
  async function runWithRetries<T>(
    task: Task<T>,
    stats: BatchStats,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      await paced();
      const startMs = clock.now();
      try {
        const result = await task.run(run.signal);
        failuresInARow = 0;
        const ms = clock.now() - startMs;
        stats.latenciesMs.push(ms);
        onEvent({
          type: "request",
          batch: stats.name,
          label: task.label,
          attempt,
          ms,
        });
        return result;
      } catch (error) {
        if (!(error instanceof TemporaryError) || run.signal.aborted)
          throw error;
        failuresInARow++;
        if (attempt === MAX_ATTEMPTS) throw error;
        retries++;
        stats.retries++;
        throwIfThrottled(error);
        const delayMs = retryDelayMs(error, attempt);
        onEvent({
          type: "retry",
          batch: stats.name,
          label: task.label,
          attempt,
          reason: error.message,
          delayMs,
        });
        await clock.sleep(delayMs, run.signal);
      }
    }
  }

  /** Fails the run as throttled once the retry budget is spent (R5). */
  function throwIfThrottled(error: TemporaryError): void {
    const why =
      failuresInARow >= MAX_FAILURES_IN_A_ROW
        ? `${failuresInARow} temporary failures in a row`
        : retries > MAX_RETRIES_PER_RUN
          ? `more than ${MAX_RETRIES_PER_RUN} retries in this run`
          : null;
    if (why !== null)
      throw new FlowFailure("throttled", `${why}, the last: ${error.message}`);
  }

  /**
   * How long to wait after `attempt` failed with `error`: the backoff, or a
   * longer `Retry-After`, which also holds back every other request (R4).
   */
  function retryDelayMs(error: TemporaryError, attempt: number): number {
    const jitter = 1 + JITTER * (2 * random() - 1);
    const backoffMs = FIRST_BACKOFF_MS * 2 ** (attempt - 1) * jitter;
    const { retryAfterMs } = error;
    if (retryAfterMs === undefined) return backoffMs;
    if (retryAfterMs > MAX_RETRY_AFTER_MS) {
      throw new FlowFailure(
        "throttled",
        `asked to wait ${retryAfterMs / 1000}s (${error.message}); more than ${MAX_RETRY_AFTER_MS / 1000}s`,
      );
    }
    const delayMs = Math.max(retryAfterMs, backoffMs);
    nextStartMs = Math.max(nextStartMs, clock.now() + delayMs);
    return delayMs;
  }

  async function batch<T>(
    name: string,
    tasks: readonly Task<T>[],
  ): Promise<T[]> {
    if (run.signal.aborted) throw run.signal.reason;
    const results = new Array<T>(tasks.length);
    const stats: BatchStats = { name, retries: 0, latenciesMs: [] };
    const startMs = clock.now();
    let next = 0;

    async function worker(): Promise<void> {
      while (!run.signal.aborted && next < tasks.length) {
        const index = next++;
        try {
          results[index] = await runWithRetries(tasks[index]!, stats);
        } catch (error) {
          // the first fatal error stops everything; the rest are its echoes
          if (!run.signal.aborted) run.abort(error);
        }
      }
    }

    const workers = Math.min(settings.concurrency, tasks.length);
    // wait for every worker, so nothing runs once the batch has failed
    await Promise.all(Array.from({ length: workers }, worker));
    if (run.signal.aborted) throw run.signal.reason;
    const elapsedMs = clock.now() - startMs;
    onEvent({
      type: "batch",
      batch: name,
      requests: tasks.length,
      elapsedMs,
      ratePerSecond: elapsedMs > 0 ? (tasks.length * 1000) / elapsedMs : 0,
      retries: stats.retries,
      latencyMs: {
        p50: percentile(stats.latenciesMs, 50),
        p95: percentile(stats.latenciesMs, 95),
        p99: percentile(stats.latenciesMs, 99),
      },
    });
    return results;
  }

  return { batch };
}

function checkSettings({ concurrency, ratePerSecond }: FlowSettings): void {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new FlowFailure(
      "bad-config",
      `concurrency ${concurrency}: expected a whole number, at least 1`,
    );
  }
  if (
    ratePerSecond !== null &&
    !(Number.isFinite(ratePerSecond) && ratePerSecond > 0)
  ) {
    throw new FlowFailure(
      "bad-config",
      `rate ${ratePerSecond}: expected requests per second, more than 0, or no cap`,
    );
  }
}

interface BatchStats {
  name: string;
  retries: number;
  /** Of each successful attempt. */
  latenciesMs: number[];
}

/** The nearest-rank percentile; 0 when there are no values. */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}
