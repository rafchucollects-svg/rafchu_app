const DATABASE_NAME = "rafchu-story-photos";
const STORE_NAME = "drafts";
const EPHEMERAL_FIELDS = new Set([
  "url",
  "previewUrl",
  "objectUrl",
  "scanBase64",
  "scanMimeType",
  "generatedUrl",
  "generatedImage",
  "generatedBlob",
  "generatedImageUrl",
]);

function persistedValue(value) {
  if (value === null || typeof value !== "object" || value instanceof Blob)
    return value;
  if (Array.isArray(value)) return value.map(persistedValue);
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, item]) =>
          !EPHEMERAL_FIELDS.has(key) &&
          item !== undefined &&
          typeof item !== "function",
      )
      .map(([key, item]) => [
        key,
        key === "status" && ["scanning", "processing", "queued"].includes(item)
          ? "review"
          : persistedValue(item),
      ]),
  );
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("This browser cannot save photo drafts locally."));
      return;
    }
    let settled = false;
    const request = indexedDB.open(DATABASE_NAME, 1);
    const fail = (message) => {
      settled = true;
      reject(new Error(message));
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: "userId" });
    };
    request.onerror = () =>
      fail("The photo draft could not be opened in this browser.");
    request.onblocked = () =>
      fail("Close other Rafchu tabs to enable local photo drafts.");
    request.onsuccess = () => {
      if (settled) request.result.close();
      else {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
  });
}

async function draftRequest(userId, mode, operation) {
  if (!userId) throw new Error("Sign in to save a photo draft.");
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => {
        database.close();
        resolve(request.result);
      };
      const failed = () => {
        database.close();
        reject(
          new Error(
            "The photo draft could not be saved. Your browser storage may be full or unavailable.",
          ),
        );
      };
      transaction.onabort = failed;
      transaction.onerror = failed;
    } catch (error) {
      database.close();
      reject(error);
    }
  });
}

export async function loadStoryDraft(userId) {
  const record = await draftRequest(userId, "readonly", (store) =>
    store.get(userId),
  );
  return record?.draft ? persistedValue(record.draft) : null;
}

export async function saveStoryDraft(userId, draft) {
  const record = {
    userId,
    draft: persistedValue(draft),
    updatedAt: Date.now(),
  };
  await draftRequest(userId, "readwrite", (store) => store.put(record));
}

export async function deleteStoryDraft(userId) {
  await draftRequest(userId, "readwrite", (store) => store.delete(userId));
}
