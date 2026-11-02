/**
 * The acceptance comparison (#31): `bun run compare`. It reads only the
 * output file and the reference copy, joins them on `bookId`, and compares
 * every field exactly. Nothing is tolerated: every difference is listed, to
 * be explained and approved by the user.
 *
 * One rule, approved in #28 and #31: `userDateCreated` and `userDateAdded`
 * are compared by day. No page has the time of day, so the output stores the
 * day shown (a US Pacific day) as `YYYY-MM-DDT00:00:00.000Z`. The reference
 * timestamp is turned into its America/Los_Angeles day with the named zone
 * (−7 in summer, −8 in winter, on the right dates; never a fixed offset);
 * the output's day is its first 10 characters, with no conversion.
 *
 * Prints a summary, writes every difference to `data/compare.txt`, and exits
 * 1 when there is any difference.
 */
import { join } from "node:path";

import type { Compat, CompatItem } from "./mapping.ts";

/** One field of one book that differs. */
export interface Difference {
  bookId: string;
  title: string;
  field: keyof CompatItem;
  reference: string;
  output: string;
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
   * Books in both that moved: the fewest whose removal leaves the rest in
   * the reference's relative order.
   */
  moved: { bookId: string; title: string }[];
  differences: Difference[];
}

/** Compared by day: no page has the time of day (#28). */
const BY_DAY = new Set<keyof CompatItem>(["userDateCreated", "userDateAdded"]);

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
 * by day.
 */
export function compare(reference: Compat, output: Compat): Comparison {
  const outputs = new Map(output.items.map((item) => [item.bookId, item]));
  const references = new Set(reference.items.map((item) => item.bookId));
  const brief = ({ bookId, title }: CompatItem) => ({ bookId, title });

  const differences: Difference[] = [];
  for (const ref of reference.items) {
    const out = outputs.get(ref.bookId);
    if (out === undefined) continue;
    const fields = new Set([...Object.keys(ref), ...Object.keys(out)]);
    for (const field of fields as Set<keyof CompatItem>) {
      let was = String(ref[field] ?? "(absent)");
      let now = String(out[field] ?? "(absent)");
      if (BY_DAY.has(field) && was !== "" && now !== "") {
        // listed as "day (as stored)", so the timestamp stays visible
        was = `${pacificDay(was)} (${was})`;
        now = `${now.slice(0, 10)} (${now})`;
        if (was.slice(0, 10) === now.slice(0, 10)) continue;
      }
      if (was !== now)
        differences.push({
          bookId: ref.bookId,
          title: ref.title,
          field,
          reference: was,
          output: now,
        });
    }
  }

  const inBoth = output.items.filter((item) => references.has(item.bookId));
  const moved = movedItems(
    reference.items.filter((item) => outputs.has(item.bookId)),
    inBoth,
  ).map(brief);

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
    differences,
  };
}

/**
 * The items of `output` not on a longest run in the reference's relative
 * order (a longest increasing subsequence of reference positions).
 */
function movedItems(
  reference: readonly CompatItem[],
  output: readonly CompatItem[],
): CompatItem[] {
  const position = new Map(reference.map((item, i) => [item.bookId, i]));
  const seq = output.map((item) => position.get(item.bookId)!);
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

  const perField = new Map<string, Set<string>>();
  for (const { field, bookId } of differences)
    perField.set(field, (perField.get(field) ?? new Set()).add(bookId));
  const books = new Set(differences.map((d) => d.bookId));
  lines.push(
    `differences: ${differences.length} fields, in ${books.size} of the books in both`,
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
    comparison.differences.length === 0
  );
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../../../..");
  const [
    referencePath = join(root, "goodreads-rss-ng-2026-10-27T15.37Z.json"),
    outputPath = join(root, "goodreads-rss.json"),
  ] = process.argv.slice(2);
  const listPath = join(root, "data/compare.txt");
  const comparison = compare(
    (await Bun.file(referencePath).json()) as Compat,
    (await Bun.file(outputPath).json()) as Compat,
  );
  console.log(`reference: ${referencePath}\noutput:    ${outputPath}`);
  for (const line of summarize(comparison)) console.log(line);
  await Bun.write(
    listPath,
    [
      ...listChanged(comparison),
      "differences:",
      ...listDifferences(comparison),
    ].join("\n") + "\n",
  );
  console.log(`every difference: ${listPath}`);
  process.exitCode = identical(comparison) ? 0 : 1;
}
