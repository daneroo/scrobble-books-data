import {
  fetchWithTimeout,
  fetchWithTimeoutUsingAbortController,
} from "./goodreads/fetchWithTimeout";

// time deno run --allow-net --unstable-sloppy-imports src/burn-in-fetch-timeout.ts
// time bun src/burn-in-fetch-timeout.ts
async function main() {
  const url = "https://www.goodreads.com/review/show/3103683909";
  const timeout = 300;
  const gracePeriod = 1000;

  async function justFetch() {
    return await fetch(url);
  }
  async function usingPromiseRace() {
    return await fetchWithTimeout(url, {}, timeout);
  }
  async function usingAbortController() {
    return await fetchWithTimeoutUsingAbortController(url, {}, timeout);
  }
  const nameAndFunc = {
    // justFetch,
    usingAbortController,
    usingPromiseRace,
  };

  while (true) {
    const times = 10;
    for (const [name, func] of Object.entries(nameAndFunc)) {
      console.log(`- ${name} x ${times} times`);
      for (let i = 0; i < times; i++) {
        const { elapsed, success } = await timeIt(name, func);
        if (success) {
          // - vvv
          // console.log(` - ${name} success:${success} ${elapsed}ms`);
        } else {
          // -vv
          // console.error(` - ${name} success:${success} ${elapsed}ms`);
        }
        if (elapsed > timeout + gracePeriod) {
          console.error(
            ` - ${name} timeout too long: ${elapsed}ms > timeout:${timeout}ms + gracePeriod:${gracePeriod}ms`
          );
        }
      }
    }
  }
}
await main();

export async function timeIt(
  name: string,
  operation: () => Promise<any>
): Promise<{ elapsed: number; success: boolean }> {
  const start = Date.now();
  let success = true;
  try {
    await operation();
  } catch (e) {
    success = false;
    const elapsed = Date.now() - start;
    // if (e instanceof Error) {
    //   console.error(`- ${name} failed ${e.message} in ${elapsed}ms`);
    // }
  } finally {
    const elapsed = Date.now() - start;
    return { elapsed, success };
  }
}
