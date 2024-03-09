# scrape-ng

Use playwright and cheerio to crawl goodreads (reviews)

- works bun - ts-node is OUT

## TODO

- [ ] fetchWithTimeout
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

## Navigation

We want to retrieve the list of all books for a user. These are called reviews listings, and are paginated.

- Review listing is characterized by user,shelf,per_page,sort,order and page
  - e.g. `https://www.goodreads.com/review/list/${GOODREADS_USER}?shelf=%23ALL%23&sort=date_updated&order=d`
  - e.g. `https://www.goodreads.com/review/list/${GOODREADS_USER}?shelf=read&per_page=20&sort=date_added&order=d&page=3`
- Login is optional, but constrains some parameters
  - e.g. per_page=20, sort=added|date_added are fixed
- Some details (reading progress event) are not in the review listing, but are in the individual book review page.

## Setup

```bash
pnpm install playwright cheerio # .. see package.json
pnpx playwright install

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
