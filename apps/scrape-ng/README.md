# scrape-ng

Use playwright and cheerio to crawl goodreads (reviews)

- works bun - ts-node is OUT

## TODO

- [ ] Fail (or Retry with new Browser/Page) login (fail to navigate: throw)
- [x] bun added to GHActions - not invoked yet
  - [ ] bun test - which tests?
  - [ ] bun run (scrape-ng: no commit)
- [x] fetchWithTimeout
- [ ] fix html-list-auth shelves (wo/progress)
- [ ] retry with backoff: delay between attempts and growing timeout
- [ ] speed test fetch html even in browser can re-use same cheerio code
- [ ] fetch/cheerio auth: see if shelves are present when cookies transferred
  - new test for login: `window.ue.tag('review:list:signed_out', ue.main_scope)` vs `signed_in`
- [ ] <https://github.com/rbren/rss-parser>
- [ ] column specifiers as data (scraping context neutral?)
- [ ] Robust/Selective fill in of reading progress here instead!
- [ ] Runtime validation of items: ReviewItem[]

- command line options
  - [ ] compare command
- [ ] testing bun vs node:test
- [ ] test and document the columns schema
- [ ] run test on GitHub Actions/act
- [ ] Document Navigation for scraping
- [ ] add some tests

## Performance

- review listing: essentially same in browser and html - per_page=100 is faster but requires authentication
- review single items: browser is 2x slower than html
  - waitUntil:load seems to be responsible, but waitUntil:domcontentloaded is not that much faster
- rss might be a good compromise - no read_count - has link to item review (progress/event/read_count)

  | wo/progress | auth    | per_page | Time #1 | Time #2 | Time #3 |
  | ----------- | ------- | -------- | ------- | ------- | ------- |
  | browser     | auth    | 100      | 26.937s | 27.402s | 27.429s |
  | html        | auth    | 100      | 24.386s | 24.819s | 25.226s |
  | browser     | auth    | 20       | 69.557s | 59.429s | 59.558s |
  | html        | auth    | 20       | 50.581s | 53.033s | 50.510s |
  | html        | no-auth | 20       | 36.706  | 38.081s | 37.072s |

| w/progress | per_page |  Time #1 |          Time #2 |          Time #3 |      Avg |
| ---------- | -------: | -------: | ---------------: | ---------------: | -------: |
| browser    |      100 | 816.868s | webkit: 900.446s | firefox:818.294s | 845.203s |
| browser    |      100 | 738.235s |         811.233s |         747.231s |          |
| html       |      100 | 385.010s |         443.675s |         390.354s | 406.346s |

## Navigation

We want to retrieve the list of all books for a user. These are called reviews listings, and are paginated.

- Review listing is characterized by user,shelf,per_page,sort,order and page
  - e.g. `https://www.goodreads.com/review/list/${GOODREADS_USER}?shelf=%23ALL%23&sort=date_updated&order=d`
  - e.g. `https://www.goodreads.com/review/list/${GOODREADS_USER}?shelf=read&per_page=20&sort=date_added&order=d&page=3`
- Login is optional, but constrains some parameters
  - e.g. per_page=20, sort=added|date_added are fixed
- Some details (reading progress events) are not in the review listing, but are in the individual book review page.

## Setup

```bash
pnpm install playwright cheerio # .. see package.json
# actual browser need also to be installed (on MacOS: ~/Library/Caches/ms-playwright/)
pnpx playwright install -h
pnpx playwright install chrome
pnpx playwright uninstall -h
pnpx playwright uninstall

# get your secrets
set -a && source ../../secrets/GOODREADS.env && set +a
pnpm start
# or
bun src/index.ts
```

### Converting to Typescript

After the project was started, using .mjs and JSDoc comments for types, I decided to convert to TypeScript.

```bash
pnpm add -D typescript ts-node @types/node
pnpm dlx tsc --init
mv src/index.mjs src/index.ts
pnpm tsc --init # and fix it line by line using chatGPT, WTF
```

## References

- [Blog](https://oxylabs.io/blog/playwright-web-scraping)
- [Playwright](https://playwright.dev/)
- [Puppeteer](https://pptr.dev/)
