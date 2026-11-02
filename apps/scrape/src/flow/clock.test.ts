import { describe, expect, test } from "bun:test";

import { realClock } from "./clock.ts";

describe("real clock", () => {
  test("an aborted sleep rejects with the abort reason", async () => {
    const abort = new AbortController();
    const reason = new Error("stop");
    const sleeping = realClock.sleep(60_000, abort.signal).catch((e) => e);
    abort.abort(reason);
    expect(await sleeping).toBe(reason);
  });

  test("a sleep on an aborted signal rejects at once", async () => {
    const reason = new Error("stopped already");
    const sleeping = realClock.sleep(60_000, AbortSignal.abort(reason));
    expect(await sleeping.catch((e) => e)).toBe(reason);
  });
});
