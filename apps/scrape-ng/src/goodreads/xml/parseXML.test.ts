import { describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import path from "path";

import { parseXML } from "./parseXML";

describe("parseXML", () => {
  test("parse a valid goodreads rss xml file", async () => {
    const xmlFilePath = path.join(
      __dirname,
      "__tests__",
      "fixtures",
      "goodreads-rss-ng-2-items.xml"
    );
    const xmlContent = await fs.readFile(xmlFilePath, "utf8");
    const xmlObject = await parseXML(xmlContent);
    expect(xmlObject).toBeDefined();
    // returned object should look like {rss: {channel: {item: [{}]}}}
    expect(xmlObject.rss).toBeDefined();
    expect(xmlObject.rss.channel).toBeDefined();
    expect(xmlObject.rss.channel.item).toBeDefined();
    // and be an array
    expect(xmlObject.rss.channel.item).toBeInstanceOf(Array);
  });

  test("numeric values should still be returned as strings", async () => {
    const xmlFilePath = path.join(
      __dirname,
      "__tests__",
      "fixtures",
      "goodreads-rss-ng-2-items.xml"
    );
    const xmlContent = await fs.readFile(xmlFilePath, "utf8");
    const xmlObject = await parseXML(xmlContent);
    expect(xmlObject).toBeDefined();
    expect(xmlObject.rss.channel.ttl).toBeString();
    expect(xmlObject.rss.channel.item[0].book_id).toBeString();
  });

  test("zero item rss.channel.item feed should be undefined", async () => {
    const xmlFilePath = path.join(
      __dirname,
      "__tests__",
      "fixtures",
      "goodreads-rss-ng-0-items.xml"
    );
    const xmlContent = await fs.readFile(xmlFilePath, "utf8");

    const xmlObject = await parseXML(xmlContent);
    expect(xmlObject).toBeDefined();
    expect(xmlObject.rss.channel.item).toBeUndefined();
  });
  test("single item rss feed should be an array", async () => {
    const xmlFilePath = path.join(
      __dirname,
      "__tests__",
      "fixtures",
      "goodreads-rss-ng-1-items.xml"
    );
    const xmlContent = await fs.readFile(xmlFilePath, "utf8");

    const xmlObject = await parseXML(xmlContent);
    expect(xmlObject).toBeDefined();
    expect(xmlObject.rss.channel.item).toBeInstanceOf(Array);
  });
});
