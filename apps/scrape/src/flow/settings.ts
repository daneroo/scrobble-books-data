import { parseArgs } from "node:util";

import { FlowFailure, type FlowSettings } from "./flow.ts";

/** How one setting is read: its flag, its env var, and how to parse it. */
interface SettingSpec<T> {
  flag: string;
  envVar: string;
  /** The default: approved in #26, about 12 min for a full run. */
  fallback: T;
  /** The value, or `undefined` if malformed. */
  parse(value: string): T | undefined;
  /** What a good value looks like, for the error message. */
  expected: string;
}

const CONCURRENCY: SettingSpec<number> = {
  flag: "concurrency",
  envVar: "SCRAPE_CONCURRENCY",
  fallback: 2,
  parse: (value) => (/^[1-9]\d*$/.test(value) ? Number(value) : undefined),
  expected: "a whole number, at least 1",
};

const RATE: SettingSpec<number | null> = {
  flag: "rate",
  envVar: "SCRAPE_RATE",
  fallback: 2,
  parse(value) {
    if (value === "none") return null;
    if (!/^\d+(\.\d+)?$/.test(value)) return undefined;
    const rate = Number(value);
    return rate > 0 ? rate : undefined;
  },
  expected: 'requests per second, more than 0, or "none"',
};

/**
 * The flow settings, from the command line (`--concurrency N` or `-c N`,
 * `--rate R|none`), else the environment (`SCRAPE_CONCURRENCY`,
 * `SCRAPE_RATE`), else the defaults (2, and 2/s). Other arguments are
 * ignored. A malformed value throws a `bad-config` FlowFailure.
 */
export function flowSettings(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): FlowSettings {
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
    concurrency: read(CONCURRENCY, values, env),
    ratePerSecond: read(RATE, values, env),
  };
}

/** The flag if given, else the env var if set, parsed; else the default. */
function read<T>(
  spec: SettingSpec<T>,
  flags: Record<string, string | boolean | undefined>,
  env: Record<string, string | undefined>,
): T {
  const sources: [name: string, value: string | boolean | undefined][] = [
    [`--${spec.flag}`, flags[spec.flag]],
    [spec.envVar, env[spec.envVar]],
  ];
  for (const [name, value] of sources) {
    if (value === undefined) continue;
    // a flag with no value parses as `true`
    const parsed = typeof value === "string" ? spec.parse(value) : undefined;
    if (parsed === undefined) {
      const shown =
        typeof value === "string" ? JSON.stringify(value) : "no value";
      throw new FlowFailure(
        "bad-config",
        `${name} ${shown}: expected ${spec.expected}`,
      );
    }
    return parsed;
  }
  return spec.fallback;
}
