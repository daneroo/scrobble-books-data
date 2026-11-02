import type { Failure } from "./failure.ts";

/** The result of a login test run: login, then fetch one list page. */
export type Outcome =
  | {
      ok: true;
      cookie: string;
      loginMs: number;
      listPage: { status: number; bytes: number };
    }
  | { ok: false; cookie?: string; failure: Failure };

/** Values that must never reach a log. */
export interface Secrets {
  email: string;
  password: string;
  user: string;
}

/** Log lines, and the process exit code. */
export interface Report {
  lines: string[];
  exitCode: number;
}

/** Turns an outcome into log lines and the process exit code. */
export function report(outcome: Outcome, secrets: Secrets): Report {
  const { lines, exitCode } = summarize(outcome);
  const redact = redactor(secrets, outcome.cookie);
  return { lines: lines.map(redact), exitCode };
}

function summarize(outcome: Outcome): Report {
  if (!outcome.ok) {
    const { step, mode, detail, url, status } = outcome.failure;
    const lines = [`FAIL: ${step} ${mode}: ${detail}`];
    if (url !== undefined) lines.push(`  url: ${withoutQuery(url)}`);
    if (status !== undefined) lines.push(`  status: ${status}`);
    return { lines, exitCode: 1 };
  }
  return {
    lines: [
      `PASS: signed in (${outcome.loginMs}ms); list page ${outcome.listPage.status}, signed-in marker found, ${outcome.listPage.bytes} bytes`,
    ],
    exitCode: 0,
  };
}

// Cookie values shorter than this (e.g. `locale=en`) aren't secret, and
// replacing them everywhere would garble the log.
const MIN_COOKIE_VALUE_LENGTH = 6;

/** Replaces every secret, the cookie and each long cookie value. */
function redactor(secrets: Secrets, cookie = ""): (line: string) => string {
  const cookieValues = cookie
    .split(";")
    .map((pair) => pair.slice(pair.indexOf("=") + 1).trim())
    .filter((value) => value.length >= MIN_COOKIE_VALUE_LENGTH);
  const values = [
    secrets.email,
    secrets.password,
    secrets.user,
    cookie,
    ...cookieValues,
  ]
    .flatMap((value) => [value, encodeURIComponent(value)])
    .filter((value) => value !== "")
    // longest first, so the whole cookie goes before its parts
    .sort((a, b) => b.length - a.length);
  return (line) =>
    values.reduce((text, value) => text.replaceAll(value, "[redacted]"), line);
}

// Query strings on Amazon sign-in and verification pages carry session-ish
// tokens and say nothing useful.
function withoutQuery(url: string): string {
  try {
    const { origin, pathname } = new URL(url);
    return origin + pathname;
  } catch {
    return url.split("?")[0] ?? "";
  }
}
