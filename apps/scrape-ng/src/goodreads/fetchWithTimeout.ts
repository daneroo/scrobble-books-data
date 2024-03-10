export async function fetchWithTimeout(
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
