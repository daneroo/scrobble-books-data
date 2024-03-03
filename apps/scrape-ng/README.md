# scrape-ng

Use playwright to crawl goodreads

## TODO

- [x] validate login
- [ ] add retry logic - getItemsFromReviewURL
- [ ] validate what can be accomplished with no login (cheerio?)
- [ ] test and document the columns schema
- [ ] column specifiers as data
- [ ] run test on GitHub Actions/act
- [ ] Document Navigation for scraping
- [ ] add some tests

## Navigation

Basic idea, is to login, get all books (perhaps for a specific shelf) by page, and then get the reading progress for each book.

We need a robust test, for the login, and book list iteration termination.

### Unauthenticated

It seems I can navigate unauthenticated, but implied and unchangeable are per_page=20 and sort=added|date_added, however pagination works.
with page=1,2,3..

I can also view a specific review!

### Parts

- Login
- My Books (by shelf: #ALL#, read, currently-reading, to-read), on-deck, etc
  - This is for a userId (here the `-daniel-lauzon` part of the URL is actually optional)
  - e.g.: `https://www.goodreads.com/review/list/6883912-daniel-lauzon?shelf=%23ALL%23&title=daniel-lauzon&sort=date_updated&order=d`
- Individual book review (Only want 'READING PROGRESS' section for now)
  - the review page has a user specific id, not the same as book id
  - e.g.: `https://www.goodreads.com/review/show/4789085651`
- Stats i.e. books by year (interesting but not used anymore)

## Setup

```bash
pnpm install playwright
pnpx playwright install

# get your secrets
set -a && source ../../secrets/GOODREADS.env && set +a
node src/index.mjs
# or
pnpm start
```

## References

- [Blog](https://oxylabs.io/blog/playwright-web-scraping)
- [Playwright](https://playwright.dev/)
- [Puppeteer](https://pptr.dev/)
