export class RequestTimeoutError extends Error {
  constructor(message: string, options: { cause: unknown }) {
    super(message, options);
    this.name = "RequestTimeoutError";
  }
}

export async function withRequestTimeout<T>(
  workerSignal: AbortSignal,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = AbortSignal.any([workerSignal, timeoutSignal]);

  try {
    return await operation(requestSignal);
  } catch (error: unknown) {
    if (workerSignal.aborted || !timeoutSignal.aborted) {
      throw error;
    }

    throw new RequestTimeoutError("Heyering request timed out", {
      cause: error,
    });
  }
}
