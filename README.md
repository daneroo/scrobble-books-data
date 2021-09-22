# scrobble-books-data

Tracking reading data

This repo archives the latest version of my reading data every 20 minutes.

You can look at [the formatted data table here](https://flatgithub.com/daneroo/scrobble-books-data).

## Description

Because we are using githubocto/flat@v3, which uses Typescript as it's postprocessor,
and the `xml2js` cannot be used by Deno, we have implementes the scrapiing in Node.js for now.
We are still using `flat` for committing back the changes.

## TODO

- Try to use <https://www.skypack.dev/view/xml2js>
- Ensure no trivial updates (lastBuildDate)
- Clean up the data more
- [CueBlox](https://www.cueblox.com/): see if it appropriate to use

## Testing locally

```bash
# need to comment: cache: 'npm' for now
act --secret-file GOODREADS.secrets

. GOODREADS.env 
npm start

. GOODREADS.env 
deno run -q --allow-read --allow-write --allow-run --allow-net --allow-env --unstable deno-src/postprocess.js goodreads-rss-p1.xml
```

## References

- [flat-data post](https://next.github.com/projects/flat-data)
- [GitHub Action - Flat Data](https://github.com/marketplace/actions/flat-data)
- [Git scraping: track changes over time by scraping to a Git repository](https://simonwillison.net/2020/Oct/9/git-scraping/)
- [Fire Example](https://github.com/simonw/ca-fires-history)
