import { unlink } from "node:fs/promises";

import { describe, expect, test } from "bun:test";

import { readFile, writeFile } from "./index.mjs";

describe("writeFile then readFile", () => {
  test("writes text to a file, then reads it back", async () => {
    const path = "./test.txt";
    const text = "Hello World";

    await writeFile(path, text);

    const writtenText = await readFile(path);
    expect(writtenText).toEqual(text);
    // Clean up
    await unlink(path);
  });
});
