import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_STORY_SCAN_ATTEMPTS, runStoryPhotoScan } from "./storyPhotoScan";

const failure = (code, message = "Scan failed") =>
  Object.assign(new Error(message), { code });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("story photo scan retries", () => {
  it("returns the successful operation result unchanged on the first attempt", async () => {
    const result = { data: { cards: [{ name: "Pikachu" }] } };
    const controller = new AbortController();
    const operation = vi.fn().mockResolvedValue(result);
    const onAttempt = vi.fn();
    expect(MAX_STORY_SCAN_ATTEMPTS).toBe(3);
    await expect(
      runStoryPhotoScan(operation, { signal: controller.signal, onAttempt }),
    ).resolves.toBe(result);
    expect(operation).toHaveBeenCalledExactlyOnceWith({
      attempt: 1,
      maxAttempts: 3,
      signal: controller.signal,
    });
    expect(onAttempt).toHaveBeenCalledExactlyOnceWith({
      attempt: 1,
      maxAttempts: 3,
      retrying: false,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits 800ms and 1800ms between attempts and stops on success", async () => {
    const result = [{ name: "Mew", grade: "10" }];
    const operation = vi
      .fn()
      .mockRejectedValueOnce(failure("functions/unavailable"))
      .mockRejectedValueOnce(failure("functions/internal"))
      .mockResolvedValue(result);
    const onAttempt = vi.fn();
    const scan = runStoryPhotoScan(operation, { onAttempt });
    await vi.advanceTimersByTimeAsync(0);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(799);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1799);
    expect(operation).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(scan).resolves.toBe(result);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onAttempt.mock.calls.map(([progress]) => progress)).toEqual([
      { attempt: 1, maxAttempts: 3, retrying: false },
      { attempt: 2, maxAttempts: 3, retrying: true },
      { attempt: 3, maxAttempts: 3, retrying: true },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "functions/internal",
    "functions/resource-exhausted",
    "functions/deadline-exceeded",
    "functions/unavailable",
    "functions/unknown",
    "auth/network-request-failed",
    "network-error",
    "ECONNRESET",
    "ETIMEDOUT",
    "story/no-cards",
  ])(
    "retries transient failure %s and returns the final error after three attempts",
    async (code) => {
      const error = failure(code);
      const operation = vi.fn().mockRejectedValue(error);
      const scan = runStoryPhotoScan(operation);
      const assertion = expect(scan).rejects.toBe(error);
      await vi.runAllTimersAsync();
      await assertion;
      expect(operation).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("retries browser fetch errors and uncoded errors", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new Error("An unexpected scan error occurred"))
      .mockResolvedValue(["recognized card"]);
    const scan = runStoryPhotoScan(operation);
    await vi.runAllTimersAsync();
    await expect(scan).resolves.toEqual(["recognized card"]);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("retries empty detections when the operation marks them as no-cards", async () => {
    const detections = [[], [null], [{ name: "Charizard" }]];
    const operation = vi.fn(({ attempt }) => {
      const cards = detections[attempt - 1].filter((card) => card?.name);
      if (!cards.length) throw failure("story/no-cards");
      return cards;
    });
    const scan = runStoryPhotoScan(operation);
    await vi.runAllTimersAsync();
    await expect(scan).resolves.toEqual([{ name: "Charizard" }]);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it.each([
    "functions/unauthenticated",
    "functions/permission-denied",
    "functions/invalid-argument",
    "functions/failed-precondition",
    "functions/not-found",
    "functions/unimplemented",
    "auth/user-token-expired",
    "functions/cancelled",
    "ERR_CANCELED",
  ])("does not retry permanent or cancellation error %s", async (code) => {
    const error = failure(code, "Network request failed");
    const operation = vi.fn().mockRejectedValue(error);
    await expect(runStoryPhotoScan(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 401, 403, 404, 422])(
    "does not retry HTTP status %s",
    async (status) => {
      const error = Object.assign(new Error("Network request failed"), {
        status,
      });
      const operation = vi.fn().mockRejectedValue(error);
      await expect(runStoryPhotoScan(operation)).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
    },
  );

  it.each([408, 429, 500, 503])(
    "retries transient HTTP status %s",
    async (status) => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce({ response: { status } })
        .mockResolvedValue("done");
      const scan = runStoryPhotoScan(operation);
      await vi.runAllTimersAsync();
      await expect(scan).resolves.toBe("done");
      expect(operation).toHaveBeenCalledTimes(2);
    },
  );

  it("does not retry an AbortError from the operation", async () => {
    const error = Object.assign(new Error("Cancelled"), { name: "AbortError" });
    const operation = vi.fn().mockRejectedValue(error);
    await expect(runStoryPhotoScan(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("never calls the operation or progress callback if already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn();
    const onAttempt = vi.fn();
    await expect(
      runStoryPhotoScan(operation, { signal: controller.signal, onAttempt }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(operation).not.toHaveBeenCalled();
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it("cancels during backoff without another attempt or pending timer", async () => {
    const controller = new AbortController();
    const operation = vi
      .fn()
      .mockRejectedValue(failure("functions/unavailable"));
    const onAttempt = vi.fn();
    const scan = runStoryPhotoScan(operation, {
      signal: controller.signal,
      onAttempt,
    });
    const assertion = expect(scan).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(300);
    controller.abort("Photo removed");
    await assertion;
    await vi.runAllTimersAsync();
    expect(operation).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resolve", "reject"])(
    "cancels an in-flight request promptly and ignores its late %s",
    async (settle) => {
      const controller = new AbortController();
      const request = deferred();
      const operation = vi.fn().mockReturnValue(request.promise);
      const scan = runStoryPhotoScan(operation, { signal: controller.signal });
      const assertion = expect(scan).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await assertion;
      request[settle](
        settle === "resolve"
          ? ["late detection"]
          : failure("functions/internal"),
      );
      await vi.runAllTimersAsync();
      expect(operation).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("does not start a retry if progress handling cancels it", async () => {
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue(failure("functions/internal"));
    const onAttempt = vi.fn(({ attempt }) => {
      if (attempt === 2) controller.abort();
    });
    const scan = runStoryPhotoScan(operation, {
      signal: controller.signal,
      onAttempt,
    });
    const assertion = expect(scan).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("removes all abort listeners after retries succeed", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const operation = vi
      .fn()
      .mockRejectedValueOnce(failure("functions/internal"))
      .mockResolvedValue("done");
    const scan = runStoryPhotoScan(operation, { signal: controller.signal });
    await vi.runAllTimersAsync();
    await expect(scan).resolves.toBe("done");
    expect(add).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
    for (const [, handler] of add.mock.calls)
      expect(remove).toHaveBeenCalledWith("abort", handler);
  });

  it("does not retry invalid callbacks or progress callback errors", async () => {
    await expect(runStoryPhotoScan(null)).rejects.toBeInstanceOf(TypeError);
    const error = new Error("Progress handler failed");
    const operation = vi.fn();
    await expect(
      runStoryPhotoScan(operation, {
        onAttempt: () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);
    expect(operation).not.toHaveBeenCalled();
  });
});
