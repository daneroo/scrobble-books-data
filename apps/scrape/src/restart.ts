import { restarts } from "./failure.ts";
import type { Clock } from "./flow/clock.ts";
import { LIMITS } from "./limits.ts";
import type { Outcome } from "./report.ts";

export interface RestartOptions {
  /** Runs pass `n`, from 1; a pass after the first reuses the saved pages. */
  pass: (n: number) => Promise<Outcome>;
  clock: Clock;
  log: (line: string) => void;
}

/**
 * A run: passes until one passes (#50). After a pass that fails on a WAF
 * challenge or on too many retries, it waits 60 s and restarts, at most 100
 * times. Any other failure ends the run at once.
 */
export async function runWithRestarts(
  options: RestartOptions,
): Promise<{ outcome: Outcome; passes: number }> {
  const { pass, clock, log } = options;
  const { restartWaitMs, restartsPerRun } = LIMITS;
  for (let n = 1; ; n++) {
    const outcome = await pass(n);
    if (outcome.ok) return { outcome, passes: n };
    const { step, mode, detail } = outcome.failure;
    const why = `${step} ${mode}: ${detail}`;
    if (!restarts(outcome.failure)) {
      log(`pass ${n} failed, not restarted: ${why}`);
      return { outcome, passes: n };
    }
    const restart = n;
    if (restart > restartsPerRun) {
      log(`pass ${n} failed; no restart left (${restartsPerRun}): ${why}`);
      return { outcome, passes: n };
    }
    log(
      `pass ${n} failed: ${why}; restart ${restart}/${restartsPerRun} in ${restartWaitMs / 1000}s`,
    );
    await clock.sleep(restartWaitMs);
  }
}
