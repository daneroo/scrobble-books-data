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
