/**
 * Every limit that bounds or ends a run, in one place, to be reviewed.
 *
 * Each one is a plain number, so a bound reads as one sentence. The values
 * are provisional: they come from the robustness criteria (#26,
 * `thoughts/robustness-criteria.md`) and from the first real full run
 * (#30, 2026-11-02), and are reviewed in calibration.
 *
 * First real run, list and review pages at concurrency 2, 2/s: no 429, 503
 * or 202; review pages p50 618 ms, p95 978 ms, p99 1.7 s, max 3.8 s; 21 of
 * ~1060 review requests (~2%) got no response in 15 s, evenly spread, never
 * two in a row, and every one retried succeeded on attempt 2.
 */
export const LIMITS = {
  // ── Pacing (P2, P4), the defaults of --concurrency and --rate ──

  /** Requests in flight at most. 3, as scrape-ng and the prototype ran. */
  concurrency: 3,
  /**
   * Requests started per second at most, across all requests in flight.
   * Was 2 (#26), which made the rate cap, not concurrency, the limit: ~12 min
   * of review pages. The prototype ran ~3.5–4/s with no 429, 503 or 202.
   */
  ratePerSecond: 6,

  // ── One request (T1, T2, R3, R4) ──

  /** A list page must answer, body included, within this (T2). */
  listPageTimeoutMs: 30_000,
  /**
   * A review page must answer, body included, within this (T2). The slowest
   * answer seen was 3.8 s; a timeout is a stall, fine on retry.
   */
  reviewPageTimeoutMs: 15_000,
  /**
   * Attempts per request, the first included; then it fails the run (R3).
   * Was 4; a real run (#30) had requests that needed 3.
   */
  attemptsPerRequest: 6,
  /**
   * The wait before retry n is n × this: 2, 4, 6, 8, 10 s, 30 s in all
   * (R3). Linear; doubling (as before #30) would wait 62 s in all.
   */
  backoffStepMs: 2000,
  /** Each wait varies by up to this fraction, either way (R3). */
  backoffJitter: 0.25,
  /** A longer `Retry-After` fails the run as `throttled` (R4). */
  maxRetryAfterMs: 60_000,

  // ── The whole run (R5, T3, C1) ──

  /**
   * More retries than this in one run fails it as `throttled` (R5). Was
   * 20, which the first real run passed with ~2% timeouts (21 retries
   * after ~1060 of 1465 requests); 100 is about 3× that run's pace.
   */
  retriesPerRun: 100,
  /**
   * This many temporary failures in a row fails the run as `throttled` (R5).
   * Was 5; more than one request's 6 attempts, so one stalled request alone
   * can't trip it.
   */
  failuresInARow: 10,
  /** The whole run, login included, must end within this (T3). */
  runDeadlineMs: 30 * 60_000,
  /** More list pages than this (40,000 books) fails the run (C1). */
  maxListPages: 400,
} as const;
