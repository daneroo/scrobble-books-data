# scrape-ng

Use playwright to crawl goodreads

## TODO

- [ ] run test on GitHub Actions/act
- [ ] Document Navigation for scraping
- [ ] add some tests

## Setup

```bash
pnpm install playwright
pnpx playwright install

# get your sectrets
set -a && source ../../secrets/GOODREADS.env && set +a
node src/index.mjs
# or
pnpm start
```

## References

- [Blog](https://oxylabs.io/blog/playwright-web-scraping)
- [Playwright](https://playwright.dev/)
- [Puppeteer](https://pptr.dev/)
