/**
 * The acceptance comparison (#31): `bun run compare`. It reads only the
 * output file and the reference copy, joins them on `bookId`, and compares
 * every field exactly. Nothing is tolerated: every difference is listed, to
 * be explained and approved by the user.
 *
 * Dates (#28, #31): `userDateAdded`, `userDateCreated` and `userReadAt` are
 * compared by day. No page has the time of day, so the output stores the
 * day shown (a US Pacific day) as `YYYY-MM-DDT00:00:00.000Z`; its day is its
 * first 10 characters, with no conversion. The reference's `userDateAdded`
 * and `userDateCreated` are real moments: each is turned into its
 * America/Los_Angeles day with the named zone (−7 in summer, −8 in winter,
 * on the right dates; never a fixed offset). The reference's `userReadAt` is
 * already a day (midnight UTC): its first 10 characters, no conversion.
 *
 * A date difference is explained, in this order, when:
 * 1. changed after the cutoff: either day is after 2026-10-27;
 * 2. timeline event on the reference day (`userDateAdded` only): the book's
 *    timeline in goodreads.json has an entry dated that day.
 * Otherwise it is unexplained, like every other difference.
 *
 * Prints a summary, writes the explained date differences and every other
 * difference to `apps/scrape/compare.txt`, and exits 1 when there is any difference.
 */
import { dirname, join } from "node:path";

import type { TimelineRow } from "../goodreads.ts";
import type { Compat, CompatItem } from "./mapping.ts";

/** One field of one book that differs. */
export interface Difference {
  bookId: string;
  title: string;
  field: keyof CompatItem;
  reference: string;
  output: string;
}

/** The rules that explain a date difference, in the order they are tried. */
export type DateRule = "changed after the cutoff" | "timeline event";

/** A date difference with the rule that explains it. */
export interface ExplainedDifference extends Difference {
  rule: DateRule;
  /** e.g. "changed after the cutoff", "last updated 2025-02-12: Finished Reading" */
  reason: string;
}

export interface Comparison {
  /** `title` of each file, when they differ. */
  title?: { reference: string; output: string };
  referenceBooks: number;
  outputBooks: number;
  /** In the reference, not in the output. */
  missing: { bookId: string; title: string }[];
  /** In the output, not in the reference. */
  added: { bookId: string; title: string }[];
  /**
   * Changed bookIds (an edition switch): a missing book and a new one with
   * the same title.
   */
  changed: { from: string; to: string; title: string }[];
  /**
   * Books in both (changed bookIds included) that moved: the fewest whose
   * removal leaves the rest in the reference's relative order.
   */
  moved: { bookId: string; title: string }[];
  /** Date differences explained by a rule. */
  explained: ExplainedDifference[];
  /** Every other difference: unexplained. */
  differences: Difference[];
}

/** Compared by day: no page has the time of day (#28). */
const BY_DAY = new Set<keyof CompatItem>([
  "userDateCreated",
  "userDateAdded",
  "userReadAt",
]);

/** The reference's real moments, turned into their Pacific day. */
const PACIFIC = new Set<keyof CompatItem>(["userDateCreated", "userDateAdded"]);

/** The reference copy's date: a date after it changed after the cutoff. */
export const CUTOFF = "2026-10-27";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "February 12, 2025" → "2025-02-12"; any other text (no day) → undefined. */
export function timelineDay(dateText: string): string | undefined {
  const match = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(dateText);
  const month = match === null ? -1 : MONTHS.indexOf(match[1]!);
  if (month < 0) return undefined;
  const mm = String(month + 1).padStart(2, "0");
  return `${match![3]}-${mm}-${match![2]!.padStart(2, "0")}`;
}

/**
 * "2026-10-27T06:58:07.000Z" → "2026-10-26": the day in America/Los_Angeles,
 * by the named zone, so daylight saving time applies on the right dates.
 */
export function pacificDay(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

/**
 * Compares `output` with `reference`, field by field, exactly; the two dates
 * by day. A changed bookId's two books are compared like any other.
 */
export function compare(
  reference: Compat,
  output: Compat,
  /** Each output book's timeline (goodreads.json), by bookId. */
  timelines: ReadonlyMap<string, readonly TimelineRow[]> = new Map(),
): Comparison {
  const outputs = new Map(output.items.map((item) => [item.bookId, item]));
  const references = new Set(reference.items.map((item) => item.bookId));
  const brief = ({ bookId, title }: CompatItem) => ({ bookId, title });

  const missing = reference.items
    .filter((item) => !outputs.has(item.bookId))
    .map(brief);
  const added = output.items
    .filter((item) => !references.has(item.bookId))
    .map(brief);
  const changed = missing.flatMap(({ bookId, title }) =>
    added
      .filter((book) => book.title === title)
      .map((book) => ({ from: bookId, to: book.bookId, title })),
  );

  // each reference book's output book: the same bookId, or its changed one
  const counterpart = new Map<string, CompatItem>();
  for (const ref of reference.items) {
    const out = outputs.get(ref.bookId);
    if (out !== undefined) counterpart.set(ref.bookId, out);
  }
  for (const { from, to } of changed) counterpart.set(from, outputs.get(to)!);

  const explained: ExplainedDifference[] = [];
  const differences: Difference[] = [];
  for (const ref of reference.items) {
    const out = counterpart.get(ref.bookId);
    if (out === undefined) continue;
    const fields = new Set([...Object.keys(ref), ...Object.keys(out)]);
    for (const field of fields as Set<keyof CompatItem>) {
      const was = String(ref[field] ?? "(absent)");
      const now = String(out[field] ?? "(absent)");
      if (!BY_DAY.has(field)) {
        if (was !== now)
          differences.push({
            bookId: ref.bookId,
            title: ref.title,
            field,
            reference: was,
            output: now,
          });
        continue;
      }
      const wasDay =
        was === ""
          ? ""
          : PACIFIC.has(field)
            ? pacificDay(was)
            : was.slice(0, 10);
      const nowDay = now.slice(0, 10);
      if (wasDay === nowDay) continue;
      const difference: Difference = {
        bookId: ref.bookId,
        title: ref.title,
        field,
        // listed as "day (as stored)", so the timestamp stays visible
        reference: was === "" ? "" : `${wasDay} (${was})`,
        output: now === "" ? "" : `${nowDay} (${now})`,
      };
      const explanation = explain(
        field,
        wasDay,
        nowDay,
        timelines.get(out.bookId) ?? [],
      );
      if (explanation === undefined) differences.push(difference);
      else explained.push({ ...difference, ...explanation });
    }
  }

  // the reference bookId of each output book that has a counterpart
  const referenceIdOf = new Map(
    [...counterpart].map(([refId, out]) => [out.bookId, refId]),
  );
  const moved = movedIds(
    reference.items
      .filter((item) => counterpart.has(item.bookId))
      .map((item) => item.bookId),
    output.items.flatMap((item) => {
      const refId = referenceIdOf.get(item.bookId);
      return refId === undefined ? [] : [refId];
    }),
  ).map((refId) => brief(counterpart.get(refId)!));

  return {
    ...(reference.title === output.title
      ? {}
      : { title: { reference: reference.title, output: output.title } }),
    referenceBooks: reference.items.length,
    outputBooks: output.items.length,
    missing,
    added,
    changed,
    moved,
    explained,
    differences,
  };
}

/** The first rule that explains a date difference, with its reason. */
function explain(
  field: keyof CompatItem,
  referenceDay: string,
  outputDay: string,
  timeline: readonly TimelineRow[],
): { rule: DateRule; reason: string } | undefined {
  if (referenceDay > CUTOFF || outputDay > CUTOFF)
    return {
      rule: "changed after the cutoff",
      reason: "changed after the cutoff",
    };
  if (field === "userDateAdded") {
    const events = timeline
      .filter(({ dateText }) => timelineDay(dateText) === referenceDay)
      .map(({ event }) => event);
    if (events.length > 0)
      return {
        rule: "timeline event",
        reason: `last updated ${referenceDay}: ${events.join(", ")}`,
      };
  }
  return undefined;
}

/**
 * The ids of `output` not on a longest run in the reference's relative
 * order (a longest increasing subsequence of reference positions).
 */
function movedIds(
  reference: readonly string[],
  output: readonly string[],
): string[] {
  const position = new Map(reference.map((id, i) => [id, i]));
  const seq = output.map((id) => position.get(id)!);
  // tails[k]: the index in seq ending the best run of length k + 1
  const tails: number[] = [];
  const previous: number[] = [];
  seq.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < value) lo = mid + 1;
      else hi = mid;
    }
    previous[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  });
  const kept = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = previous[i]!) kept.add(i);
  return output.filter((_, i) => !kept.has(i));
}

/** The summary: counts, books missing or added, differences per field. */
export function summarize(comparison: Comparison): string[] {
  const { referenceBooks, outputBooks, missing, added, differences } =
    comparison;
  const lines = [
    `reference ${referenceBooks} books, output ${outputBooks} books`,
  ];
  if (comparison.title !== undefined)
    lines.push(
      `title differs: ${JSON.stringify(comparison.title.reference)} → ${JSON.stringify(comparison.title.output)}`,
    );
  lines.push(`missing from the output: ${missing.length}`);
  for (const { bookId, title } of missing) lines.push(`  ${bookId} ${title}`);
  lines.push(`new in the output: ${added.length}`);
  for (const { bookId, title } of added) lines.push(`  ${bookId} ${title}`);
  lines.push(...listChanged(comparison));
  lines.push(`moved, among the books in both: ${comparison.moved.length}`);
  for (const { bookId, title } of comparison.moved)
    lines.push(`  ${bookId} ${title}`);

  const perRule = new Map<string, Map<DateRule, number>>();
  for (const { field, rule } of comparison.explained) {
    const rules = perRule.get(field) ?? new Map<DateRule, number>();
    perRule.set(field, rules.set(rule, (rules.get(rule) ?? 0) + 1));
  }
  lines.push(`explained date differences: ${comparison.explained.length}`);
  for (const [field, rules] of perRule)
    lines.push(
      `  ${field}: ${[...rules].map(([rule, n]) => `${n} ${rule}`).join(", ")}`,
    );

  const perField = new Map<string, Set<string>>();
  for (const { field, bookId } of differences)
    perField.set(field, (perField.get(field) ?? new Set()).add(bookId));
  const books = new Set(differences.map((d) => d.bookId));
  lines.push(
    `unexplained differences: ${differences.length} fields, in ${books.size} of the books in both`,
  );
  for (const [field, ids] of [...perField].sort(
    (a, b) => b[1].size - a[1].size,
  ))
    lines.push(`  ${field}: ${ids.size} books`);
  return lines;
}

/** The changed bookIds section: old → new, with the title. */
export function listChanged(comparison: Comparison): string[] {
  return [
    `changed bookIds (same title): ${comparison.changed.length}`,
    ...comparison.changed.map(
      ({ from, to, title }) => `  ${from} → ${to} ${title}`,
    ),
  ];
}

/** Every explained date difference, one per line, with its reason. */
export function listExplained(comparison: Comparison): string[] {
  return [
    `explained date differences: ${comparison.explained.length}`,
    ...comparison.explained.map(
      ({ bookId, title, field, reference, output, reason }) =>
        `${bookId}\t${field}\t${JSON.stringify(reference)} → ${JSON.stringify(output)}\t${reason}\t${title}`,
    ),
  ];
}

/** Every difference, one per line: book, field, reference → output. */
export function listDifferences(comparison: Comparison): string[] {
  return comparison.differences.map(
    ({ bookId, title, field, reference, output }) =>
      `${bookId}\t${field}\t${JSON.stringify(reference)} → ${JSON.stringify(output)}\t${title}`,
  );
}

/** True when the files are the same: no difference of any kind. */
export function identical(comparison: Comparison): boolean {
  return (
    comparison.title === undefined &&
    comparison.missing.length === 0 &&
    comparison.added.length === 0 &&
    comparison.moved.length === 0 &&
    comparison.explained.length === 0 &&
    comparison.differences.length === 0
  );
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../../../..");
  const [
    referencePath = join(root, "goodreads-rss-ng-2026-10-27T15.37Z.json"),
    outputPath = join(root, "goodreads-rss.json"),
  ] = process.argv.slice(2);
  const listPath = join(root, "apps/scrape/compare.txt");
  // goodreads.json sits beside the compatibility file
  const goodreadsPath = join(dirname(outputPath), "goodreads.json");
  const goodreads = (await Bun.file(goodreadsPath).json()) as {
    items: { bookId: string; timeline: TimelineRow[] }[];
  };
  const comparison = compare(
    (await Bun.file(referencePath).json()) as Compat,
    (await Bun.file(outputPath).json()) as Compat,
    new Map(goodreads.items.map(({ bookId, timeline }) => [bookId, timeline])),
  );
  console.log(`reference: ${referencePath}\noutput:    ${outputPath}`);
  for (const line of summarize(comparison)) console.log(line);
  await Bun.write(
    listPath,
    [
      ...listChanged(comparison),
      ...listExplained(comparison),
      "differences:",
      ...listDifferences(comparison),
    ].join("\n") + "\n",
  );
  console.log(`every difference: ${listPath}`);
  process.exitCode = identical(comparison) ? 0 : 1;
}
