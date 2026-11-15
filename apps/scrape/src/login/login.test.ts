/**
 * The saved session, read in a real headless browser on a fresh empty
 * profile (under `data/`, deleted after each test), from a fake Goodreads
 * served on localhost: no request reaches Goodreads.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { savedSession } from "./login.ts";
import { homePage } from "../testing/fake-goodreads.ts";

const DATA_DIR = join(import.meta.dir, "../../../../data");

let profileDir: string;
beforeEach(async () => {
  await mkdir(DATA_DIR, { recursive: true });
  profileDir = await mkdtemp(join(DATA_DIR, "test-profile-"));
});
afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

/** Serves the home page, signed in or not; records every path asked for. */
function fakeHome(signedIn: boolean) {
  const paths: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      paths.push(pathname);
      if (pathname !== "/") return new Response("not found", { status: 404 });
      return new Response(homePage({ signedIn }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });
  return { paths, server, origin: server.url.origin };
}

describe("savedSession", () => {
  test("a signed-out profile fails as signed-out, saying to run bun run login, and never signs in", async () => {
    const { paths, server, origin } = fakeHome(false);
    try {
      const result = await savedSession({ profileDir, origin });
      expect(result).toEqual({
        ok: false,
        failure: {
          step: "login",
          mode: "signed-out",
          detail: "run bun run login",
          url: `${origin}/`,
        },
      });
      // only the home page: no sign-in page, no sign-in form
      expect(paths.filter((path) => path !== "/favicon.ico")).toEqual(["/"]);
    } finally {
      await server.stop(true);
    }
  });

  test("a signed-in profile gives the session, with a headed User-Agent", async () => {
    const { server, origin } = fakeHome(true);
    try {
      const result = await savedSession({ profileDir, origin });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.userAgent).toContain("Chrome/");
        expect(result.userAgent).not.toContain("HeadlessChrome");
      }
    } finally {
      await server.stop(true);
    }
  });
});
