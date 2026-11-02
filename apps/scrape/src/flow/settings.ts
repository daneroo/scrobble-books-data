import { parseArgs } from "node:util";

import { FlowFailure, type FlowSettings } from "./flow.ts";

/** How one flag is read: its name, its default, and how to parse it. */
interface SettingSpec<T> {
  flag: string;
  /** The default: approved in #26, about 12 min for a full run. */
  fallback: T;
  /** The value, or `undefined` if malformed. */
  parse(value: string): T | undefined;
  /** What a good value looks like, for the error message. */
  expected: string;
}

const CONCURRENCY: SettingSpec<number> = {
  flag: "concurrency",
  fallback: 2,
  parse: (value) => (/^[1-9]\d*$/.test(value) ? Number(value) : undefined),
  expected: "a whole number, at least 1",
};

const RATE: SettingSpec<number | null> = {
  flag: "rate",
  fallback: 2,
  parse(value) {
    if (value === "none") return null;
    if (!/^\d+(\.\d+)?$/.test(value)) return undefined;
    const rate = Number(value);
    return rate > 0 ? rate : undefined;
  },
  expected: 'max requests started per second, more than 0, or "none"',
};

/**
 * The flow settings, from the command line only: `--concurrency N` (or
 * `-c N`) and `--rate R|none` (max requests started per second), else the
 * defaults (2, and 2/s). Other arguments are ignored. A malformed value throws
 * a `bad-config` FlowFailure.
 */
export function flowSettings(argv: readonly string[]): FlowSettings {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      [CONCURRENCY.flag]: { type: "string", short: "c" },
      [RATE.flag]: { type: "string" },
    },
    strict: false,
    allowPositionals: true,
  });
  return {
    concurrency: read(CONCURRENCY, values[CONCURRENCY.flag]),
    ratePerSecond: read(RATE, values[RATE.flag]),
  };
}

/** The flag's value parsed if given, else the default. */
function read<T>(spec: SettingSpec<T>, value: string | boolean | undefined): T {
  if (value === undefined) return spec.fallback;
  // a flag with no value parses as `true`
  const parsed = typeof value === "string" ? spec.parse(value) : undefined;
  if (parsed === undefined) {
    const shown =
      typeof value === "string" ? JSON.stringify(value) : "no value";
    throw new FlowFailure(
      "bad-config",
      `--${spec.flag} ${shown}: expected ${spec.expected}`,
    );
  }
  return parsed;
}
