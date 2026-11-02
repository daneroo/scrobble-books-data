import { describe, expect, test } from "bun:test";

import {
  createFlow,
  FlowFailure,
  formatEvent,
  TemporaryError,
  type FlowEvent,
  type FlowSettings,
  type Task,
} from "./flow.ts";
import { VirtualClock } from "./virtual-clock.ts";

/** The error a promise rejects with; fails the test if it resolves. */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    (value) => {
      throw new Error(`expected a rejection, got ${JSON.stringify(value)}`);
    },
    (error: unknown) => error,
  );
}

/** The mode of the FlowFailure a promise rejects with. */
async function failureMode(promise: Promise<unknown>): Promise<string> {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(FlowFailure);
  return (error as FlowFailure).mode;
}

/** A flow on a virtual clock; `random` 0.5 means no jitter. */
function setup(settings: Partial<FlowSettings> = {}, random = () => 0.5) {
  const clock = new VirtualClock();
  const events: FlowEvent[] = [];
  const flow = createFlow(
    { concurrency: 1, ratePerSecond: null, ...settings },
    { clock, random, onEvent: (event) => events.push(event) },
  );
  /** A fake request: takes `ms` of virtual time, then returns `value`. */
  const task = <T>(label: string, ms: number, value: T): Task<T> => ({
    label,
    run: (signal) => clock.sleep(ms, signal).then(() => value),
  });
  /** Watches tasks: when each starts and ends, and the most in flight. */
  const watch = () => {
    const starts: number[] = [];
    const ends: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const timed = <T>(label: string, ms: number, value: T): Task<T> => ({
      label,
      run: async (signal) => {
        starts.push(clock.now());
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        try {
          await clock.sleep(ms, signal);
          return value;
        } finally {
          inFlight--;
          ends.push(clock.now());
        }
      },
    });
    return { starts, ends, timed, max: () => maxInFlight };
  };
  /**
   * A request that takes `ms` (10 by default) per attempt and throws each of
   * `failures` in turn, then returns `value`. `attempts` holds each
   * attempt's start.
   */
  const flaky = <T>(label: string, failures: Error[], value: T, ms = 10) => {
    const attempts: number[] = [];
    const t: Task<T> = {
      label,
      run: async (signal) => {
        attempts.push(clock.now());
        await clock.sleep(ms, signal);
        const failure = failures[attempts.length - 1];
        if (failure !== undefined) throw failure;
        return value;
      },
    };
    return { task: t, attempts };
  };
  return { clock, flow, task, watch, flaky, events };
}

describe("flow controller", () => {
  test("results come back in input order, whatever order they complete in", async () => {
    const { clock, flow, task } = setup({ concurrency: 3 });
    const tasks = [
      task("a", 300, "A"),
      task("b", 100, "B"),
      task("c", 200, "C"),
      task("d", 50, "D"),
    ];
    expect(await clock.settle(flow.batch("pages", tasks))).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  test("never more requests in flight than the concurrency", async () => {
    const { clock, flow, watch } = setup({ concurrency: 3 });
    const w = watch();
    const durations = [500, 120, 80, 300, 40, 260, 90, 700, 10, 150];
    const tasks = durations.map((ms, i) => w.timed(`t${i}`, ms, i));
    await clock.settle(flow.batch("pages", tasks));
    expect(w.max()).toBe(3);
    expect(w.starts).toHaveLength(10);
  });

  test("concurrency 1 is strictly sequential", async () => {
    const { clock, flow, watch } = setup({ concurrency: 1 });
    const w = watch();
    const tasks = [100, 50, 200].map((ms, i) => w.timed(`t${i}`, ms, i));
    await clock.settle(flow.batch("pages", tasks));
    expect(w.max()).toBe(1);
    // each starts when the one before ends
    expect(w.starts).toEqual([0, 100, 150]);
    expect(w.ends).toEqual([100, 150, 350]);
  });

  test("the rate cap spaces request starts, however many could run", async () => {
    const { clock, flow, watch } = setup({ concurrency: 4, ratePerSecond: 2 });
    const w = watch();
    const tasks = [10, 10, 10, 10, 10, 10].map((ms, i) =>
      w.timed(`t${i}`, ms, i),
    );
    await clock.settle(flow.batch("pages", tasks));
    expect(w.starts).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });

  test("the rate cap holds across batches", async () => {
    const { clock, flow, watch } = setup({ concurrency: 2, ratePerSecond: 4 });
    const w = watch();
    await clock.settle(flow.batch("list", [w.timed("a", 10, 1)]));
    await clock.settle(flow.batch("reviews", [w.timed("b", 10, 2)]));
    expect(w.starts).toEqual([0, 250]);
  });

  test("a temporary error is retried after 2 s, then 4 s", async () => {
    const { clock, flow, flaky } = setup();
    const { task, attempts } = flaky(
      "/page",
      [new TemporaryError("status 503"), new TemporaryError("timeout")],
      "ok",
    );
    expect(await clock.settle(flow.batch("pages", [task]))).toEqual(["ok"]);
    // each attempt fails 10 ms after it starts
    expect(attempts).toEqual([0, 2010, 6020]);
  });

  test("a request gets 4 attempts; the 4th temporary error is fatal", async () => {
    const { clock, flow, flaky } = setup();
    const last = new TemporaryError("status 503");
    const { task, attempts } = flaky(
      "/page",
      [
        new TemporaryError("timeout"),
        new TemporaryError("status 502"),
        new TemporaryError("status 429"),
        last,
      ],
      "never",
    );
    expect(await failure(clock.settle(flow.batch("pages", [task])))).toBe(last);
    expect(attempts).toEqual([0, 2010, 6020, 14030]);
  });

  test("any other error is fatal at once, with no retry", async () => {
    const { clock, flow, flaky } = setup();
    const redirect = new Error("redirect to sign-in");
    const { task, attempts } = flaky("/page", [redirect], "never");
    expect(await failure(clock.settle(flow.batch("pages", [task])))).toBe(
      redirect,
    );
    expect(attempts).toEqual([0]);
  });

  test("a fatal error aborts requests in flight and clears the queue", async () => {
    const { clock, flow, watch, flaky } = setup({ concurrency: 2 });
    const w = watch();
    const fatal = new Error("signed out");
    const tasks = [
      w.timed("slow", 1000, 0),
      flaky("/bad", [fatal], 1).task,
      w.timed("queued-1", 10, 2),
      w.timed("queued-2", 10, 3),
    ];
    const batch = flow.batch("pages", tasks);
    expect(await failure(clock.settle(batch))).toBe(fatal);
    // "slow" was aborted when "/bad" failed at 10 ms; the queue never ran
    expect(w.starts).toEqual([0]);
    expect(w.ends).toEqual([10]);
    expect(clock.pending).toBe(0);
  });

  test("a fatal error ends the run: a later batch starts nothing", async () => {
    const { clock, flow, watch, flaky } = setup();
    const w = watch();
    const fatal = new Error("signed out");
    await failure(
      clock.settle(flow.batch("list", [flaky("/bad", [fatal], 0).task])),
    );
    const later = await failure(
      clock.settle(flow.batch("reviews", [w.timed("/next", 10, 1)])),
    );
    expect(later).toBe(fatal);
    expect(w.starts).toEqual([]);
  });

  test("an outside signal (the run deadline) ends the run like a fatal error", async () => {
    const clock = new VirtualClock();
    const deadline = new AbortController();
    const flow = createFlow(
      { concurrency: 2, ratePerSecond: null },
      { clock, onEvent: () => {}, signal: deadline.signal },
    );
    const late = new Error("run-timeout");
    const ends: number[] = [];
    const slow: Task<void> = {
      label: "slow",
      run: (signal) =>
        clock.sleep(60_000, signal).finally(() => ends.push(clock.now())),
    };
    void clock.sleep(1000).then(() => deadline.abort(late));
    const batch = flow.batch("pages", [slow, slow, slow]);
    expect(await failure(clock.settle(batch))).toBe(late);
    // both in flight were aborted at the deadline; the third never started
    expect(ends).toEqual([1000, 1000]);
    expect(clock.pending).toBe(0);
    // and a later batch rejects at once
    expect(await failure(flow.batch("more", [slow]))).toBe(late);
  });

  test("an outside signal already aborted fails the first batch at once", async () => {
    const late = new Error("run-timeout");
    const flow = createFlow(
      { concurrency: 1, ratePerSecond: null },
      { onEvent: () => {}, signal: AbortSignal.abort(late) },
    );
    let started = false;
    const task: Task<number> = {
      label: "x",
      run: async () => {
        started = true;
        return 1;
      },
    };
    expect(await failure(flow.batch("pages", [task]))).toBe(late);
    expect(started).toBe(false);
  });

  test("a fatal error in one batch aborts another running alongside", async () => {
    const { clock, flow, watch, flaky } = setup({ concurrency: 2 });
    const w = watch();
    const fatal = new Error("signed out");
    const slow = failure(flow.batch("reviews", [w.timed("/slow", 1000, 0)]));
    const bad = failure(flow.batch("list", [flaky("/bad", [fatal], 0).task]));
    expect(await clock.settle(Promise.all([slow, bad]))).toEqual([
      fatal,
      fatal,
    ]);
    expect(w.ends).toEqual([10]);
  });

  test("a fatal error cancels a retry waiting out its backoff", async () => {
    const { clock, flow, flaky } = setup({ concurrency: 2 });
    const fatal = new Error("status 404");
    const retrying = flaky("/flaky", [new TemporaryError("timeout")], 0);
    const bad = flaky("/bad", [fatal], 1, 500);
    const batch = flow.batch("pages", [retrying.task, bad.task]);
    expect(await failure(clock.settle(batch))).toBe(fatal);
    expect(retrying.attempts).toEqual([0]);
    expect(clock.pending).toBe(0);
  });

  test("backoff has ±25% jitter", async () => {
    const randoms = [0, 1];
    const { clock, flow, flaky } = setup({}, () => randoms.shift() ?? 0.5);
    const { task, attempts } = flaky(
      "/page",
      [new TemporaryError("timeout"), new TemporaryError("timeout")],
      "ok",
    );
    await clock.settle(flow.batch("pages", [task]));
    // 2 s - 25% = 1.5 s; then 4 s + 25% = 5 s
    expect(attempts).toEqual([0, 1510, 6520]);
  });

  test("a Retry-After shorter than the backoff waits the backoff", async () => {
    const { clock, flow, flaky } = setup();
    const { task, attempts } = flaky(
      "/page",
      [new TemporaryError("status 429", { retryAfterMs: 0 })],
      "ok",
    );
    await clock.settle(flow.batch("pages", [task]));
    expect(attempts).toEqual([0, 2010]);
  });

  test("a Retry-After pauses every request start, not just the retry", async () => {
    const { clock, flow, watch, flaky } = setup({ concurrency: 2 });
    const w = watch();
    const tasks = [
      flaky(
        "/busy",
        [new TemporaryError("status 429", { retryAfterMs: 30_000 })],
        0,
      ).task,
      w.timed("/a", 100, 1),
      w.timed("/b", 100, 2),
    ];
    await clock.settle(flow.batch("pages", tasks));
    // /a ran alongside the first attempt; /b waits out the 429 too
    expect(w.starts).toEqual([0, 30_010]);
  });

  test("a Retry-After up to 60 s is waited out", async () => {
    const { clock, flow, flaky } = setup();
    const { task, attempts } = flaky(
      "/page",
      [new TemporaryError("status 429", { retryAfterMs: 60_000 })],
      "ok",
    );
    expect(await clock.settle(flow.batch("pages", [task]))).toEqual(["ok"]);
    expect(attempts).toEqual([0, 60_010]);
  });

  test("a Retry-After over 60 s fails the run as throttled, with no retry", async () => {
    const { clock, flow, flaky } = setup();
    const { task, attempts } = flaky(
      "/page",
      [new TemporaryError("status 503", { retryAfterMs: 60_001 })],
      "ok",
    );
    expect(await failureMode(clock.settle(flow.batch("pages", [task])))).toBe(
      "throttled",
    );
    expect(attempts).toEqual([0]);
  });

  const timeouts = (n: number) =>
    Array.from({ length: n }, () => new TemporaryError("timeout"));

  test("5 temporary failures in a row fail the run as throttled", async () => {
    const { clock, flow, flaky } = setup({ concurrency: 2 });
    // both fail together at 10 ms and 2020 ms; at 6030 ms the 5th failure
    // (a's 3rd) stops the run and aborts b's 3rd attempt
    const a = flaky("/a", timeouts(3), "a");
    const b = flaky("/b", timeouts(3), "b");
    expect(
      await failureMode(clock.settle(flow.batch("pages", [a.task, b.task]))),
    ).toBe("throttled");
    expect(a.attempts).toEqual([0, 2010, 6020]);
    expect(b.attempts).toEqual([0, 2010, 6020]);
    expect(clock.pending).toBe(0);
  });

  test("a success breaks the run of temporary failures", async () => {
    const { clock, flow, flaky } = setup({ concurrency: 1 });
    const a = flaky("/a", timeouts(3), "a");
    const b = flaky("/b", timeouts(3), "b");
    expect(await clock.settle(flow.batch("pages", [a.task, b.task]))).toEqual([
      "a",
      "b",
    ]);
  });

  test("more than 20 retries in a run fail it as throttled, across batches", async () => {
    const { clock, flow, flaky } = setup({ concurrency: 1 });
    const retriedOnce = (n: number) =>
      Array.from({ length: n }, (_, i) => flaky(`/${i}`, timeouts(1), i).task);
    await clock.settle(flow.batch("list", retriedOnce(20)));
    expect(
      await failureMode(clock.settle(flow.batch("reviews", retriedOnce(1)))),
    ).toBe("throttled");
  });

  test("each batch reports its elapsed time, rate, retries and latency", async () => {
    const { clock, flow, task, flaky, events } = setup({ concurrency: 5 });
    const tasks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((ms, i) =>
      task(`/${i}`, ms, i),
    );
    tasks.push(flaky("/flaky", timeouts(1), 10).task);
    await clock.settle(flow.batch("reviews", tasks));
    const [batch, ...more] = events.filter((e) => e.type === "batch");
    expect(more).toEqual([]);
    if (batch?.type !== "batch") throw new Error("no batch event");
    const { ratePerSecond, ...rest } = batch;
    expect(ratePerSecond).toBeCloseTo(5.263, 3); // 11 requests in 2.09 s
    // 5 at a time: /5../9 take the slots /0../4 free at 10..50 ms; the
    // flaky one takes /5's at 70 ms, fails at 80, retries at 2080 and is
    // done at 2090. Latency is the successful attempt's: 10 ms for it.
    expect(rest).toEqual({
      type: "batch",
      batch: "reviews",
      requests: 11,
      elapsedMs: 2090,
      retries: 1,
      latencyMs: { p50: 50, p95: 100, p99: 100 },
    });
  });

  test("every retry is reported: request, attempt, reason and delay", async () => {
    const { clock, flow, flaky, events } = setup();
    const { task } = flaky("/review/show/42", timeouts(1), "ok");
    await clock.settle(flow.batch("reviews", [task]));
    expect(events.filter((e) => e.type === "retry")).toEqual([
      {
        type: "retry",
        batch: "reviews",
        label: "/review/show/42",
        attempt: 1,
        reason: "timeout",
        delayMs: 2000,
      },
    ]);
  });

  test("every request reports its time", async () => {
    const { clock, flow, task, flaky, events } = setup();
    const tasks = [task("/a", 120, 1), flaky("/b", timeouts(1), 2).task];
    await clock.settle(flow.batch("reviews", tasks));
    expect(events.filter((e) => e.type === "request")).toEqual([
      { type: "request", batch: "reviews", label: "/a", attempt: 1, ms: 120 },
      { type: "request", batch: "reviews", label: "/b", attempt: 2, ms: 10 },
    ]);
  });

  test.each([
    ["concurrency 0", { concurrency: 0 }],
    ["concurrency 1.5", { concurrency: 1.5 }],
    ["rate 0", { ratePerSecond: 0 }],
    ["rate Infinity", { ratePerSecond: Infinity }],
  ])("%s is bad-config", (_, settings) => {
    let error: unknown;
    try {
      createFlow({ concurrency: 1, ratePerSecond: null, ...settings });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(FlowFailure);
    expect((error as FlowFailure).mode).toBe("bad-config");
  });

  test("events format as one log line each", () => {
    expect(
      formatEvent({
        type: "batch",
        batch: "reviews",
        requests: 1450,
        elapsedMs: 725_400,
        ratePerSecond: 1.9989,
        retries: 3,
        latencyMs: { p50: 412, p95: 980, p99: 1730 },
      }),
    ).toBe(
      "reviews: 1450 requests in 725.4s (2.00/s), 3 retries; latency p50 412ms, p95 980ms, p99 1730ms",
    );
    expect(
      formatEvent({
        type: "retry",
        batch: "reviews",
        label: "/review/show/42",
        attempt: 1,
        reason: "status 503",
        delayMs: 2345.6,
      }),
    ).toBe(
      "reviews: retry /review/show/42 after attempt 1/4 (status 503), waiting 2.3s",
    );
    expect(
      formatEvent({
        type: "request",
        batch: "reviews",
        label: "/review/show/42",
        attempt: 2,
        ms: 412.7,
      }),
    ).toBe("reviews: /review/show/42 in 413ms (attempt 2)");
  });
});
