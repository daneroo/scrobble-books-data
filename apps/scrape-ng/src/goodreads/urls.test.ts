import { expect, test } from "bun:test";

import { rssIterator, rssURL } from "./urls";

test("rssIterator returns expected values", async () => {
  const userId = "123";
  const GOODREADS_KEY = "abc";
  const shelf = "read";
  const maxPages = 2;

  const iter = rssIterator(userId, GOODREADS_KEY, shelf, maxPages);

  const { value: page1, done: done1 } = await iter.next();
  expect(page1.url).toEqual(
    rssURL(userId, { shelf, page: 1, key: GOODREADS_KEY })
  );
  expect(page1.urlParams).toEqual({ shelf, page: 1, key: GOODREADS_KEY });
  expect(page1.maxItemsPerPage).toEqual(100);
  expect(done1).toBe(false);

  const { value: page2, done: done2 } = await iter.next();
  expect(page2.url).toEqual(
    rssURL(userId, { shelf, page: 2, key: GOODREADS_KEY })
  );
  expect(page2.urlParams).toEqual({ shelf, page: 2, key: GOODREADS_KEY });
  expect(page2.maxItemsPerPage).toEqual(100);
  expect(done2).toBe(false);

  const { value: page3, done: done3 } = await iter.next();
  expect(page3).toBeUndefined();
  expect(done3).toBe(true);
});

test("rssIterator stops at maxPages", async () => {
  const userId = "123";
  const GOODREADS_KEY = "abc";
  const shelf = "read";
  const maxPages = 2;

  const iter = rssIterator(userId, GOODREADS_KEY, shelf, maxPages);

  let i = 0;
  for await (const page of iter) {
    i++;
  }

  expect(i).toEqual(maxPages);
});

test("rssIterator continues indefinitely if maxPages is -1", async () => {
  const userId = "123";
  const GOODREADS_KEY = "abc";
  const shelf = "read";
  const maxPages = -1;

  const iter = rssIterator(userId, GOODREADS_KEY, shelf, maxPages);
  const bigEnoughToProveThisWillNotStop = 42;
  let i = 0;
  let done = false;
  while (!done && i < bigEnoughToProveThisWillNotStop) {
    const { value, done: iterDone } = await iter.next();
    if (!iterDone) {
      i++;
    } else {
      done = true;
    }
  }

  expect(i).toBeGreaterThan(2);
});
