import { setTimeout as delay } from "node:timers/promises";

/** Time, as the flow controller sees it. Tests swap in a virtual clock. */
export interface Clock {
  /** Milliseconds, from any fixed origin. */
  now(): number;
  /**
   * Resolves after `ms`. Rejects with the signal's reason when it aborts,
   * and leaves no timer behind.
   */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Wall-clock time and real timers. */
export const realClock: Clock = {
  now: () => performance.now(),
  async sleep(ms, signal) {
    try {
      await delay(ms, undefined, { signal });
    } catch (error) {
      // node's timers reject with an AbortError that wraps the reason
      if (signal?.aborted) throw signal.reason;
      throw error;
    }
  },
};
