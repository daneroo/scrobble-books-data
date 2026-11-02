import type { Clock } from "./clock.ts";

interface Timer {
  at: number;
  resolve: () => void;
}

/**
 * A clock for tests: time stands still until `settle` moves it to the next
 * timer, so timing tests are instant and deterministic.
 */
export class VirtualClock implements Clock {
  #now = 0;
  #timers = new Set<Timer>();

  now(): number {
    return this.#now;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const timer: Timer = {
        at: this.#now + Math.max(0, ms),
        resolve: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
      };
      const onAbort = () => {
        this.#timers.delete(timer);
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#timers.add(timer);
    });
  }

  /** Timers not yet fired (nor cancelled). */
  get pending(): number {
    return this.#timers.size;
  }

  /**
   * Runs `promise` to completion: lets pending work run, then jumps to the
   * next timer, until the promise settles. Fails if it waits on nothing.
   */
  async settle<T>(promise: Promise<T>): Promise<T> {
    let settled = false;
    const watched = promise.finally(() => {
      settled = true;
    });
    // the caller awaits `watched`; don't report the rejection twice
    watched.catch(() => {});
    for (;;) {
      await new Promise((resolve) => setImmediate(resolve));
      if (settled) return watched;
      const next = [...this.#timers].sort((a, b) => a.at - b.at)[0];
      if (next === undefined) throw new Error("deadlock: no timer pending");
      this.#now = next.at;
      this.#timers.delete(next);
      next.resolve();
    }
  }
}
