import { describe, expect, test } from "bun:test";

import { FlowFailure } from "./flow.ts";
import { flowSettings } from "./settings.ts";

describe("flow settings", () => {
  test("the defaults are concurrency 2 and at most 2 requests/s", () => {
    expect(flowSettings([], {})).toEqual({ concurrency: 2, ratePerSecond: 2 });
  });

  test("the environment sets them", () => {
    expect(
      flowSettings([], { SCRAPE_CONCURRENCY: "3", SCRAPE_RATE: "0.5" }),
    ).toEqual({ concurrency: 3, ratePerSecond: 0.5 });
  });

  test("the command line wins over the environment", () => {
    expect(
      flowSettings(["--concurrency", "1", "--rate=4"], {
        SCRAPE_CONCURRENCY: "3",
        SCRAPE_RATE: "0.5",
      }),
    ).toEqual({ concurrency: 1, ratePerSecond: 4 });
  });

  test("other arguments are left alone", () => {
    expect(flowSettings(["--pages", "2", "-c", "3"], {})).toEqual({
      concurrency: 3,
      ratePerSecond: 2,
    });
  });

  test("rate none means no cap", () => {
    expect(flowSettings(["--rate", "none"], {}).ratePerSecond).toBeNull();
    expect(flowSettings([], { SCRAPE_RATE: "none" }).ratePerSecond).toBeNull();
  });

  /** The error `flowSettings` throws; fails the test if it returns. */
  function badConfig(
    argv: string[],
    env: Record<string, string> = {},
  ): FlowFailure {
    try {
      flowSettings(argv, env);
    } catch (error) {
      if (error instanceof FlowFailure) return error;
      throw error;
    }
    throw new Error(`no error for ${JSON.stringify({ argv, env })}`);
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

  test("a malformed environment value is bad-config, naming the variable", () => {
    const error = badConfig([], { SCRAPE_CONCURRENCY: "3x" });
    expect(error.mode).toBe("bad-config");
    expect(error.message).toContain("SCRAPE_CONCURRENCY");
    expect(error.message).toContain('"3x"');
  });
});
