import { describe, expect, test } from "bun:test";

import { parseXML } from "./index.mjs";

describe("parseXML", () => {
  test("parses valid XML", async () => {
    const xml = `
      <root>
        <child>Hello</child>
      </root>
    `;

    const result = await parseXML(xml);

    expect(result).toEqual({
      root: {
        child: "Hello",
      },
    });
  });

  test("ignores attributes", async () => {
    const xml = `
      <root>
        <child id="123">Hello</child>
      </root>  
    `;

    const result = await parseXML(xml);

    expect(result).toEqual({
      root: {
        child: "Hello",
      },
    });
  });

  test("handles multiple nodes", async () => {
    const xml = `
      <root>
        <child>Hello</child>
        <child>World</child>
      </root>
    `;

    const result = await parseXML(xml);

    expect(result).toEqual({
      root: {
        child: ["Hello", "World"],
      },
    });
  });

  test("handles invalid XML by returning empty object", async () => {
    const invalidXml = "invalid";
    const result = await parseXML(invalidXml);
    await expect(result).toEqual({});
  });
});
