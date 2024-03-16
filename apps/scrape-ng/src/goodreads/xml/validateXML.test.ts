import { describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import path from "path";

import { validateXML } from "./validateXML";

describe("validateXML", () => {
  test("validate a goodreads rss xml file", async () => {
    const xmlFilePath = path.join(
      __dirname,
      "__tests__",
      "fixtures",
      "goodreads-rss-ng-2-items.xml"
    );
    const xmlContent = await fs.readFile(xmlFilePath, "utf8");
    const rssPage = await validateXML(xmlContent);
    expect(rssPage).toBeDefined();
    // returned object should look like {rss: {channel: {item: [{}]}}}
    expect(rssPage.rss).toBeDefined();
    expect(rssPage.rss.channel).toBeDefined();
    expect(rssPage.rss.channel.item).toBeDefined();
    // and be an array
    expect(rssPage.rss.channel.item).toBeInstanceOf(Array);
  });

  test("invalidate a goodreads rss xml file with missing guid", async () => {
    const xmlFilePath = path.join(
      __dirname,
      "__tests__",
      "fixtures",
      "goodreads-rss-ng-missing-guid.xml"
    );
    const xmlContent = await fs.readFile(xmlFilePath, "utf8");
    // expect validateXML(xmlContent); to throw
    expect(validateXML(xmlContent)).rejects.toThrow();
    // message should contain 'guid'
    expect(validateXML(xmlContent)).rejects.toThrow(/guid/);
    expect(validateXML(xmlContent)).rejects.toThrow(/Required/);
  });
});
