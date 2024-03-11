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
