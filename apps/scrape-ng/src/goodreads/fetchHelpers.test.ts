import { describe, expect, test } from "bun:test";

import { fetchWithTimeout } from "./fetchHelpers";

describe("fetchWithTimeout", () => {
  test("fetchWithTimeout returns response on success", async () => {
    const response = await fetchWithTimeout(
      "https://httpbin.org/delay/1",
      {},
      3000
    );
    expect(response.ok).toBe(true);
  });

  test("fetchWithTimeout times out", async () => {
    await expect(
      fetchWithTimeout("https://httpbin.org/delay/2", {}, 1000)
    ).rejects.toThrow(
      "Fetch(https://httpbin.org/delay/2) timed out in 1000ms."
    );
  });

  test("fetchWithTimeout handles fetch error", async () => {
    const response = await fetchWithTimeout(
      "https://httpbin.org/status/500",
      {},
      1000
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });

  test("fetchWithTimeout throws on invalid url", async () => {
    await expect(fetchWithTimeout("invalid_url", {}, 1000)).rejects.toThrow(
      "fetch() URL is invalid"
    );
  });

  test("fetchWithTimeout sets and sends cookie successfully", async () => {
    const response = await fetchWithTimeout(
      "https://httpbin.org/cookies",
      { headers: { Cookie: "my_key=my_value" } },
      3000
    );
    expect(response.ok).toBe(true);
    const cookieData = (await response.json()) as {
      cookies: { [key: string]: string };
    };
    expect(cookieData.cookies).toEqual({ my_key: "my_value" });

    // // Check that the "Set-Cookie" header is present in the response
    // expect(response.headers.get("Set-Cookie")).toBeDefined();
    // // Check that the "Set-Cookie" header is present in the response and has the correct value
    // const setCookieHeader =
    //   response.headers.get("Set-Cookie");
    // expect(setCookieHeader).toBeDefined();
    // expect(setCookieHeader).toEqual("my_key=my_value; Path=/");
  });

  test("fetchWithTimeout receives a cookie successfully", async () => {
    // GET https://httpbin.org/cookies/set?my_key=my_value
    // returns the cookies that were set in the original response which is a 302
    // but does not propagate the to the redirected page (no cookie-jar support in fetch API)
    // so we prevent following the redirect by setting the redirect option to "manual"
    const response = await fetchWithTimeout(
      "https://httpbin.org/cookies/set/my_key/my_value",
      {
        redirect: "manual",
      },
      3000
    );
    expect(response.ok).toBe(false);
    expect(response.status).toBe(302);

    // Check that the "Set-Cookie" header is present in the response
    expect(response.headers.get("Set-Cookie")).toBeDefined();
    // Check that the "Set-Cookie" header is present in the response and has the correct value
    const setCookieHeader = response.headers.get("Set-Cookie");
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader).toEqual("my_key=my_value; Path=/");
  });
});
