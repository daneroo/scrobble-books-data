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
