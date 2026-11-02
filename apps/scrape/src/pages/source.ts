import { realClock, type Clock } from "../flow/clock.ts";
import { TemporaryError } from "../flow/flow.ts";
import { failureModeFor, ScrapeFailure, type Step } from "../failure.ts";
import { classifyPage } from "../login/classify.ts";

/** A page as Goodreads answered it. */
export interface Page {
  url: string;
  status: number;
  headers: Headers;
  body: string;
}

/**
 * The one way pages are read: given a URL, the response. It must stop when
 * `signal` aborts.
 */
export interface PageSource {
  get(url: string, signal: AbortSignal): Promise<Page>;
  /** True when `get` would read the page from the cache, with no request. */
  has?(url: string): Promise<boolean>;
}

/** The temporary failures a page source names (R2, X1). */
export type TemporaryMode =
  "timeout" | "network-error" | "server-error" | "too-many-requests";

/**
 * A temporary failure, named: the flow controller retries it, and rethrows
 * the last one when a request uses up its attempts.
 */
export class PageTemporaryError extends TemporaryError {
  override name = "PageTemporaryError";

  constructor(
    readonly mode: TemporaryMode,
    message: string,
    options: { retryAfterMs?: number } = {},
  ) {
    super(message, options);
  }
}

export interface SignedInSourceOptions {
  /** The session cookie, as one `Cookie` header value. */
  cookie: string;
  /** The login browser's User-Agent (P7). */
  userAgent: string;
  /** Per request, body included (T1, T2). */
  timeoutMs: number;
  /** The step named in failures. */
  step: Step;
  /** The transport; tests serve saved pages through a fake one. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  clock?: Clock;
}

/**
 * The production page source: a signed-in `fetch` that sends the cookie,
 * doesn't follow redirects, and accepts only a 200 with the signed-in
 * marker.
 *
 * - A timeout, a network error, a 5xx or a 429 throws a `PageTemporaryError`;
 *   on a 429 or 503, `retryAfterMs` comes from `Retry-After`.
 * - Anything else throws a `ScrapeFailure`: a redirect, a 202 WAF challenge,
 *   a 4xx, a signed-out 200, or a 200 with no known marker.
 */
export function signedInSource(options: SignedInSourceOptions): PageSource {
  const { cookie, userAgent, timeoutMs, step } = options;
  const { fetch: send = fetch, clock = realClock } = options;

  async function get(url: string, signal: AbortSignal): Promise<Page> {
    const where = describeUrl(url);
    const timedOut = new AbortController();
    const done = new AbortController();
    clock.sleep(timeoutMs, done.signal).then(
      () => timedOut.abort(),
      () => {},
    );
    let status: number;
    let headers: Headers;
    let body: string;
    try {
      const response = await send(url, {
        headers: { Cookie: cookie, "User-Agent": userAgent },
        redirect: "manual",
        signal: AbortSignal.any([signal, timedOut.signal]),
      });
      ({ status, headers } = response);
      if (status === 429 || status >= 500) {
        // the body is of no use; don't wait for it
        await response.body?.cancel();
        throw temporaryStatus(where, status, headers);
      }
      body = await response.text();
    } catch (error) {
      if (error instanceof PageTemporaryError) throw error;
      if (signal.aborted) throw signal.reason;
      if (timedOut.signal.aborted) {
        throw new PageTemporaryError(
          "timeout",
          `${where}: no response in ${timeoutMs / 1000}s`,
        );
      }
      throw new PageTemporaryError(
        "network-error",
        `${where}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      done.abort();
    }

    return acceptPage({ url, status, headers, body }, step);
  }

  return { get };
}

/**
 * The page if it is a signed-in 200; otherwise a `ScrapeFailure` naming
 * what it is, with its body kept: a redirect, a 202 WAF challenge, a 4xx, a
 * signed-out 200, or a 200 with no known marker.
 */
export function acceptPage(page: Page, step: Step): Page {
  const { url, status, headers, body } = page;
  const where = describeUrl(url);
  const state = classifyPage({ url, status, html: body });
  if (status === 200 && state === "signed-in") return page;
  const location = headers.get("location");
  const mode =
    state === "unknown" && status !== 200
      ? "http-error"
      : failureModeFor(state);
  throw new ScrapeFailure(
    {
      step,
      mode,
      detail:
        `${where} is ${state}, status ${status}` +
        (location === null ? "" : `, redirected to ${location}`),
      url,
      status,
    },
    { body },
  );
}

/** "/review/list/<user> page 3": the path, and the page if there is one. */
function describeUrl(url: string): string {
  const { pathname, searchParams } = new URL(url);
  const page = searchParams.get("page");
  return page === null ? pathname : `${pathname} page ${page}`;
}

function temporaryStatus(
  where: string,
  status: number,
  headers: Headers,
): PageTemporaryError {
  const mode = status === 429 ? "too-many-requests" : "server-error";
  const retryAfterMs =
    status === 429 || status === 503
      ? retryAfter(headers.get("retry-after"))
      : undefined;
  return new PageTemporaryError(mode, `${where}: status ${status}`, {
    retryAfterMs,
  });
}

/** A `Retry-After` in ms: delay-seconds, or an HTTP date. */
function retryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}
