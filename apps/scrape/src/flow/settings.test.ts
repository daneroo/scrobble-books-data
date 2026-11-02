import { describe, expect, test } from "bun:test";

import { FlowFailure } from "./flow.ts";
import { flowSettings } from "./settings.ts";

describe("flow settings", () => {
  test("the defaults are concurrency 2 and at most 2 requests/s", () => {
    expect(flowSettings([])).toEqual({ concurrency: 2, ratePerSecond: 2 });
  });

  test("the command line sets them", () => {
    expect(flowSettings(["--concurrency", "1", "--rate=4"])).toEqual({
      concurrency: 1,
      ratePerSecond: 4,
    });
  });

  test("other arguments are left alone", () => {
    expect(flowSettings(["--pages", "2", "-c", "3"])).toEqual({
      concurrency: 3,
      ratePerSecond: 2,
    });
  });

  test("rate none means no cap", () => {
    expect(flowSettings(["--rate", "none"]).ratePerSecond).toBeNull();
  });

  /** The error `flowSettings` throws; fails the test if it returns. */
  function badConfig(argv: string[]): FlowFailure {
    try {
      flowSettings(argv);
    } catch (error) {
      if (error instanceof FlowFailure) return error;
      throw error;
    }
    throw new Error(`no error for ${JSON.stringify(argv)}`);
  }

  test.each([
    [["--concurrency", "0"]],
    [["--concurrency", "-1"]],
    [["--concurrency", "1.5"]],
    [["--concurrency", "two"]],
    [["--concurrency", ""]],
    [["--concurrency"]],
    [["--rate", "0"]],
    [["--rate", "-2"]],
    [["--rate", "fast"]],
    [["--rate", "Infinity"]],
    [["--rate"]],
  ])("%j is bad-config", (argv) => {
    const error = badConfig(argv);
    expect(error.mode).toBe("bad-config");
    expect(error.message).toContain(argv[0]!.slice(2));
  });
});
