import { XMLParser } from "fast-xml-parser";

export async function parseXML(xml: string): Promise<any> {
  /**
   * const options: X2jOptions = { };
   * ignoreAttributes: true (which is the default)
   * true is the default, and we do not nee attributes
   * The only attributes in the goodreads feed are:
   *   <?xml version="1.0" encoding="UTF-8"?>
   *   <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" >
   *   <atom:link href="https://www.goodreads.com/review/list_rss/6883912?key=9C2oDNblCg8nchKHD5aYs_gzgVmR5mpfiCi8B7WP0_IS0jMW&amp;shelf=%23ALL%23&amp;page=1" rel="self" type="application/rss+xml" />
   * and finally
   *   <item><book id="80342131"><num_pages></num_pages></book></item>
   * which is also available as <book_id>80342131</book_id>
   *
   * preserveOrder: false, (which is the default(
   *  preserveOrder causes the creation of  {"#text": "value"} for ALL text nodes
   *
   * ignoreDeclaration: true,
   */

  const alwaysArray = ["rss.item"]; // for case where there are 0 or 1 items
  const parser = new XMLParser({
    ignoreDeclaration: true, // remove the <?xml ?> tag
    parseTagValue: false, // do not use strnum to parse nums
    isArray: (_tagName: string, jPath, _isLeafNode, _isAttribute) =>
      alwaysArray.includes(jPath),
  });
  const result = parser.parse(xml);
  return result;
}
