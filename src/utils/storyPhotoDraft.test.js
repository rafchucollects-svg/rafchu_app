import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteStoryDraft,
  loadStoryDraft,
  saveStoryDraft,
} from "./storyPhotoDraft";

afterEach(() => vi.unstubAllGlobals());

function mockDraftDatabase() {
  const records = new Map();
  const database = {
    close: vi.fn(),
    transaction: vi.fn(() => {
      const transaction = {};
      const complete = (result) => {
        queueMicrotask(() => transaction.oncomplete());
        return { result };
      };
      transaction.objectStore = () => ({
        get: (key) => complete(records.get(key)),
        put: (record) => {
          records.set(record.userId, record);
          return complete(record.userId);
        },
        delete: (key) => {
          records.delete(key);
          return complete();
        },
      });
      return transaction;
    }),
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  });
  return { records, database };
}

describe("local story photo drafts", () => {
  it("saves photo blobs and editable labels but removes ephemeral image references", async () => {
    const { records } = mockDraftDatabase();
    const blob = new Blob(["photo"], { type: "image/png" });
    const draft = {
      activeId: "photo-1",
      settings: { format: "story" },
      photos: [
        {
          id: "photo-1",
          name: "cards.png",
          blob,
          width: 400,
          height: 300,
          url: "blob:temporary",
          scanBase64: "private encoded photo",
          generatedImageUrl: "https://old-output.example/image",
          status: "scanning",
          labels: [{ id: "label-1", priceText: "€25", x: 0.4, y: 0.8 }],
        },
      ],
    };
    await saveStoryDraft("user-a", draft);
    const restored = await loadStoryDraft("user-a");
    expect(restored.photos[0]).toMatchObject({
      blob,
      status: "review",
      labels: [{ id: "label-1", priceText: "€25", x: 0.4, y: 0.8 }],
    });
    expect(restored.photos[0]).not.toHaveProperty("url");
    expect(restored.photos[0]).not.toHaveProperty("scanBase64");
    expect(restored.photos[0]).not.toHaveProperty("generatedImageUrl");
    expect(restored.settings).toEqual({ format: "story" });
    expect(draft.photos[0].status).toBe("scanning");
    expect(records.size).toBe(1);
  });

  it("isolates users and deleting one draft leaves another user's draft intact", async () => {
    mockDraftDatabase();
    await saveStoryDraft("user-a", { photos: [{ id: "a" }] });
    await saveStoryDraft("user-b", { photos: [{ id: "b" }] });
    expect(await loadStoryDraft("user-c")).toBeNull();
    await deleteStoryDraft("user-a");
    expect(await loadStoryDraft("user-a")).toBeNull();
    expect(await loadStoryDraft("user-b")).toEqual({ photos: [{ id: "b" }] });
  });

  it("reports blocked storage immediately and closes a later opened database", async () => {
    const close = vi.fn();
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = { result: { close } };
        queueMicrotask(() => {
          request.onblocked();
          request.onsuccess();
        });
        return request;
      },
    });
    await expect(loadStoryDraft("user-a")).rejects.toThrow(
      "Close other Rafchu tabs",
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports unavailable storage and refuses anonymous draft keys", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(loadStoryDraft("user-a")).rejects.toThrow(
      "cannot save photo drafts",
    );
    await expect(saveStoryDraft("", {})).rejects.toThrow("Sign in");
  });
});
