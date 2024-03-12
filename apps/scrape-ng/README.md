# scrape-ng

Use playwright and cheerio to crawl goodreads (reviews)

- works bun - ts-node is OUT

## TODO

- New Plan

- [ ] <https://github.com/rbren/rss-parser>
- [ ] rss + match deno:scrape first
- [ ] review listing
  - [ ] speed test fetch html in parallel
  - [ ] progress% (for currently-reading shelf)
  - [ ] shelves (make multiple possible)
  - [ ] reading count
  - [ ] full events, other dates
- [x] bun added to GHActions - not invoked yet
  - [ ] bun test - which tests?
  - [ ] bun run (scrape-ng: no commit)
- [ ] column specifiers as data (scraping context neutral?)
- [ ] Runtime validation of items: RSSItem[] Zod
- command line options
  - [ ] compare command

## TODO RSS Instead of Review Listing

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

- All reading progress is done unauthenticated in html/cheerio
- Tested html:fetchReadingProgress:timeout:1000,2000 are the same
- Try no parsing of reading progress (just fetch)

| w/progress             | per_page |           Time #1 |          Time #2 |          Time #3 |      Avg |
| ---------------------- | -------: | ----------------: | ---------------: | ---------------: | -------: |
| browser                |      100 | chromium:816.868s | webkit: 900.446s | firefox:818.294s | 845.203s |
| browser                |      100 |          738.235s |         811.233s |         747.231s | 765.566s |
| html t:2000            |      100 |          395.914s |         382.303s |         381.541s | 386.586s |
| html t:1000            |      100 |          394.382s |         384.599s |         390.761s | 389.914s |
| html t:2000 no:cheerio |      100 |          377.379s |         370.422s |         364.945s | 370.915s |

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
pnpm install # .. see package.json

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

- [RSS Parser](https://github.com/rbren/rss-parser)
