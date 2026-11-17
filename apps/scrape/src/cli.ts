/**
 * Command-line parsing for `bun run scrape`, `cron` and `login`, with yargs:
 * generated `--help`, unknown options refused. Parsing never exits the
 * process and never prints; the caller does both.
 */
import yargs, { type Options } from "yargs";

import { LIMITS } from "./limits.ts";

/** The options of `bun run scrape`; `bun run cron` passes them through. */
export const SCRAPE_OPTIONS = {
  publish: {
    type: "boolean",
    describe:
      "After a passing run, upload goodreads.json to S3 (the key in secrets/S3.env), changed or not. No git.",
  },
  "save-pages": {
    type: "boolean",
    describe: "Keep the raw pages in data/scrape/pages/ after the run.",
  },
  concurrency: {
    alias: "c",
    type: "string",
    requiresArg: true,
    describe: `Requests in flight at most; 1 is strictly sequential. Default ${LIMITS.concurrency}.`,
  },
  rate: {
    type: "string",
    requiresArg: true,
    describe: `The maximum number of requests started per second (e.g. 2, or 0.5 for one every 2 s), or "none" for no cap. Default ${LIMITS.ratePerSecond}.`,
  },
} as const satisfies Record<string, Options>;

export interface Command {
  /** As typed, e.g. `bun run scrape`. */
  name: string;
  /** The text under the usage line, before the options. */
  description: string;
  options: Record<string, Options>;
  /** Text after the options. */
  epilogue?: string;
}

export type Parsed =
  | { kind: "help"; text: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; values: Record<string, unknown> };

/** Parses `args` for `command`: help, an error, or the option values. */
export async function parseCommand(
  command: Command,
  args: readonly string[],
): Promise<Parsed> {
  let parser = yargs([...args])
    .scriptName(command.name)
    .usage(`$0 [options]\n\n${command.description}`)
    .options(command.options)
    .strict()
    .help()
    .alias("h", "help")
    .version(false)
    .exitProcess(false)
    .wrap(80);
  if (command.epilogue !== undefined)
    parser = parser.epilogue(command.epilogue);
  let failure: Error | undefined;
  let output = "";
  const values = await parser.parseAsync([...args], {}, (error, _, text) => {
    failure = error ?? undefined;
    output = text;
  });
  if (failure !== undefined) return { kind: "error", message: failure.message };
  if (values.help === true) return { kind: "help", text: output };
  return { kind: "ok", values };
}
