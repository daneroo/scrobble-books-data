import { describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import path from "path";

import { parseXML } from "./parseXML";
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
    const xmlObject = await parseXML(xmlContent);

    const rssPage = await validateXML(xmlObject);
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
    const xmlObject = await parseXML(xmlContent);

    try {
      validateXML(xmlObject);
      // Explicitly fail the test with a message if no error is thrown
      throw new Error(
        "This line should never be reached if validateXML is throwing as expected."
      );
    } catch (error) {
      // Perform all assertions on the caught error
      expect(error).toBeInstanceOf(Error); // Check that it's an Error instance
      const errorMessage = (error as Error).message;
      // Check that the message contains the expected content
      expect(errorMessage).toMatch(/guid/);
      expect(errorMessage).toMatch(/Required/);
    }
  });
});
