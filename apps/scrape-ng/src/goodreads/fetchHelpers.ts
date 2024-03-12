// We are using a Promise.all based timeout
// as opposed to the AbortController method (below)
// because bun's implementation does not work as of 2024-03-11

export type RetryOpts = {
  name: string;
  timeout: number;
  maxRetries: number;
};

export async function fetchWithRetryAndTimeout(
  url: string,
  options: RequestInit,
  retryOpts: RetryOpts
): Promise<Response> {
  const { name, timeout, maxRetries } = retryOpts;
  return executeWithRetry(
    name,
    async () => {
      const response = await fetchWithTimeout(url, options, timeout);
      if (!response.ok) {
        console.debug(`- response:${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch page: ${url}`);
      }
      return response;
    },
    maxRetries
  );
}
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 10000
): Promise<Response> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`Fetch(${url}) timed out in ${timeout}ms.`));
    }, timeout);
  });

  const fetchPromise = fetch(url, options);
  return Promise.race([fetchPromise, timeoutPromise]);
}

export async function fetchWithTimeoutUsingAbortController(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Fetch(${url}) timed out in ${timeout}ms: ${error.message}`
      );
    }
    throw error; // Re-throw if it's not an Error instance.
  }
}

/**
 * Executes an asynchronous operation with retries upon failure.
 *
 * @param operation - The asynchronous operation to execute.
 * @param maxRetries - Maximum number of retries before giving up.
 * @returns A promise with the result of the async operation.
 */
export async function executeWithRetry<T>(
  name: string,
  operation: () => Promise<T>,
  maxRetries: number
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation(); // Attempt to execute the operation
    } catch (error) {
      console.error(
        `- ${name}: Attempt ${attempt + 1} of ${maxRetries} failed: ${error}`
      );
      if (attempt >= maxRetries - 1) throw error; // Rethrow the last error after all attempts fail
    }
  }
  throw new Error("executeWithRetry reached an unexpected state"); // Should never reach here
}
