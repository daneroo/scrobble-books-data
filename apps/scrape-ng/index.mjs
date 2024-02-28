import { chromium, firefox, webkit } from "playwright";

// const browserTypes = [chromium, firefox, webkit];
const browserType = chromium;
const launchOptions = {
  headless: false,
};

// get GOODREADS_USERNAME and GOODREADS_PASSWORD from the environment
const { GOODREADS_USERNAME, GOODREADS_PASSWORD } = process.env;
// exit if they are not present (say why)
if (!GOODREADS_USERNAME || !GOODREADS_PASSWORD) {
  console.error(
    "Missing GOODREADS_USERNAME or GOODREADS_PASSWORD environment variables"
  );
  process.exit(1);
}

async function main() {
  const browser = await browserType.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://www.goodreads.com/user/sign_in");
  await page.waitForTimeout(1000);

  // Click on the "Sign in with email" button
  await page.click('div#choices a:has-text("Sign in with email")');
  await page.waitForTimeout(1000);

  // Fill in the username and password
  await page.fill("#ap_email", GOODREADS_USERNAME);
  await page.waitForTimeout(1000);
  await page.fill("#ap_password", GOODREADS_PASSWORD);
  await page.waitForTimeout(1000);
  // Submit the form by clicking the sign in button
  await page.click("#signInSubmit");
  await page.waitForTimeout(1000);

  // go to the stats page
  //  click on My Books, click on the stats link, lands here
  await page.goto("https://www.goodreads.com/review/stats/6883912");
  await page.waitForTimeout(1000);
  // now go to 2024
  // https://www.goodreads.com/review/list/6883912-daniel-lauzon?read_at=2024
  await page.goto(
    "https://www.goodreads.com/review/list/6883912-daniel-lauzon?read_at=2024"
  );
  await page.waitForTimeout(1000);

  const data = await page.$$eval("table#books tbody tr", (rows) => {
    return rows.map((row) => {
      const id = row.getAttribute("id");
      const title = row.querySelector(".field.title a").textContent.trim();
      const author = row.querySelector(".field.author a").textContent.trim();
      const readCount = row
        .querySelector(".field.read_count .value")
        ?.textContent.trim();

      const dateStartedValues = Array.from(
        row.querySelectorAll(".field.date_started .date_started_value")
      ).map((el) => el.textContent.trim());

      const dateReadValues = Array.from(
        row.querySelectorAll(".field.date_read .date_read_value")
      ).map((el) => el.textContent.trim());

      return {
        id,
        title,
        author,
        readCount,
        dateStartedValues,
        dateReadValues,
      };
    });
  });
  console.log(data);
  await page.waitForTimeout(1000);

  // Now for a specific book, go to the review page (from the id=review_4789085379 above)
  const ids = ["4789085379", "3888950315"]; // Add your desired IDs here
  for (const id of ids) {
    const readingProgress = await getReadingProgress(page, id);
    await page.waitForTimeout(1000);
    console.log(id, readingProgress);
  }

  // Add a wait for 5 seconds
  await page.waitForTimeout(15000);

  await browser.close();
}

await main();
console.log("Done");

async function getReadingProgress(page, id) {
  await page.goto(`https://www.goodreads.com/review/show/${id}`);
  await page.waitForTimeout(1000);
  // ".readingTimeline .readingTimeline__row",
  // [
  //   'June 17, 2022\n–\n\nStarted Reading',
  //   'June 17, 2022\n– Shelved',
  //   'June 22, 2022\n–\n\nFinished Reading',
  //   'February 25, 2024\n–\n\nStarted Reading',
  //   'February 26, 2024\n–\n\n\n\n52.0%',
  //   'February 27, 2024\n–\n\nFinished Reading'
  // ]
  const readingProgress = await page.$$eval(
    ".readingTimeline .readingTimeline__row",
    (rows) => {
      return rows.map((row) => {
        // Get the full text and remove newline characters
        let fullText = row
          .querySelector(".readingTimeline__text")
          .textContent.replace(/\n/g, " ")
          .trim();

        // Split by '–' and use destructuring to separate date and event
        const [date, ...rest] = fullText.split("–").map((part) => part.trim());
        // warn if rest.length > 1
        if (rest.length !== 2) {
          console.warn("Unexpected event, should be exactly one '-'", row);
        }
        // join the rest back together, although rest.length should always be 1
        // if rest.length==0 then event:''
        // if rest.length>1 then we just join them back up with '-'
        const event = rest.join("-"); // join the rest back together

        return { date, event };
      });
    }
  );
  return readingProgress;
}
