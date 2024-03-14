export type SingleResultOperation<T> = () => Promise<T>;
export async function timeOne<T>(
  operation: SingleResultOperation<T>,
  message?: (elapsed: number, result: T) => void
): Promise<T> {
  const start = +new Date();
  const result = await operation();
  const elapsed = +new Date() - start;
  if (message) {
    message(elapsed, result);
  } else {
    console.log(`- in ${elapsed}ms`);
  }
  return result;
}

export type MultipleResultsOperation<T> = () => Promise<T[]>;
export async function timeMany<T>(
  operation: MultipleResultsOperation<T>,
  message?: (elapsed: number, rate: number, result: T[]) => void
): Promise<T[]> {
  const start = +new Date();
  const result = await operation();
  const elapsed = +new Date() - start;
  const rate = (result.length / elapsed) * 1000;
  if (message) {
    message(elapsed, rate, result);
  } else {
    console.log(
      `- ${result.length} items in ${elapsed}ms (${rate.toFixed(2)}/s)`
    );
  }
  return result;
}
