export const MAX_STORY_SCAN_ATTEMPTS = 3;

const RETRY_DELAYS = [800, 1800];
const TRANSIENT_CODES = new Set([
  "internal",
  "resource-exhausted",
  "deadline-exceeded",
  "unavailable",
  "unknown",
  "network-error",
  "network-request-failed",
  "failed-to-fetch",
  "no-cards",
  "etimedout",
  "econnreset",
  "econnrefused",
  "enetunreach",
  "eai-again",
]);
const PERMANENT_CODES = new Set([
  "unauthenticated",
  "permission-denied",
  "invalid-argument",
  "failed-precondition",
  "not-found",
  "unimplemented",
  "already-exists",
  "out-of-range",
  "cancelled",
  "canceled",
  "abort-err",
  "err-canceled",
]);

function cancellationError() {
  const error = new Error("Photo scanning was cancelled.");
  error.name = "AbortError";
  return error;
}

function checkCancellation(signal) {
  if (signal?.aborted) throw cancellationError();
}

function shouldRetry(error) {
  if (error?.name === "AbortError") return false;
  const fullCode = String(error?.code || "")
    .toLowerCase()
    .replaceAll("_", "-");
  const code = fullCode.split("/").pop();
  if (PERMANENT_CODES.has(code)) return false;
  if (TRANSIENT_CODES.has(code)) return true;
  // Authentication failures need a fresh sign-in, not repeated requests.
  if (fullCode.startsWith("auth/")) return false;
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 408 || status === 429 || (status >= 500 && status <= 599))
    return true;
  if (status >= 400 && status <= 499) return false;
  // Browsers often expose an interrupted fetch as an uncoded TypeError.
  if (
    /network|failed to fetch|load failed|timed?\s*out|temporarily unavailable/i.test(
      String(error?.message || ""),
    )
  )
    return true;
  // Callable wrappers may omit their code; bounded retries also cover these
  // otherwise unknown failures. Explicit unsupported codes are not retried.
  return !code;
}

function runAttempt(operation, context) {
  const { signal } = context;
  checkCancellation(signal);
  if (!signal) return Promise.resolve().then(() => operation(context));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, cancellationError());
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    // Keep handlers attached to the callable even after cancellation so a
    // late network rejection never becomes an unhandled promise rejection.
    Promise.resolve()
      .then(() => {
        checkCancellation(signal);
        return operation(context);
      })
      .then(
        (result) => (signal.aborted ? onAbort() : finish(resolve, result)),
        (error) => (signal.aborted ? onAbort() : finish(reject, error)),
      );
  });
}

function waitToRetry(milliseconds, signal) {
  checkCancellation(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(cancellationError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/**
 * Run operation({ attempt, maxAttempts, signal }) up to three times, preserving
 * its successful return value. The operation validates detected cards and can
 * throw an error with code "story/no-cards" when none are usable.
 *
 * onAttempt({ attempt, maxAttempts, retrying }) runs immediately before each
 * attempt; retrying is true for attempts 2 and 3. Backoffs are 800ms and 1800ms.
 * AbortSignal cancellation rejects promptly with AbortError during either a
 * request or backoff. Late callable results are ignored and no retry starts.
 */
export async function runStoryPhotoScan(operation, { signal, onAttempt } = {}) {
  if (typeof operation !== "function")
    throw new TypeError("A photo scanning operation is required.");
  for (let attempt = 1; attempt <= MAX_STORY_SCAN_ATTEMPTS; attempt += 1) {
    checkCancellation(signal);
    const progress = {
      attempt,
      maxAttempts: MAX_STORY_SCAN_ATTEMPTS,
      retrying: attempt > 1,
    };
    onAttempt?.(progress);
    try {
      const result = await runAttempt(operation, {
        attempt,
        maxAttempts: MAX_STORY_SCAN_ATTEMPTS,
        signal,
      });
      checkCancellation(signal);
      return result;
    } catch (error) {
      checkCancellation(signal);
      if (attempt === MAX_STORY_SCAN_ATTEMPTS || !shouldRetry(error))
        throw error;
      await waitToRetry(RETRY_DELAYS[attempt - 1], signal);
    }
  }
}
