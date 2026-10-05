import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportStoryPhoto } from "@/utils/storyPhotoMedia";
import { createStoryPhotoArchive } from "@/utils/storyPhotoArchive";
import { StoryPhotoSaveDialog } from "./StoryPhotoSaveDialog";

vi.mock("@/utils/storyPhotoMedia", () => ({ exportStoryPhoto: vi.fn() }));
vi.mock("@/utils/storyPhotoArchive", () => ({
  createStoryPhotoArchive: vi.fn(),
}));

const settings = Object.freeze({ format: "story", showCondition: true });
const photo = (name = "cards.jpg") =>
  Object.freeze({
    name,
    width: 1200,
    height: 1600,
    blob: new Blob(["photo"]),
    labels: Object.freeze([{ priceText: "€20", secondaryText: "$22" }]),
  });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const dialog = () => document.querySelector('[role="dialog"]');
const button = (name) =>
  [...dialog().querySelectorAll("button")].find(
    (element) =>
      element.textContent === name ||
      element.getAttribute("aria-label") === name,
  );
let root;
let host;
let share;
let canShare;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  exportStoryPhoto
    .mockReset()
    .mockResolvedValue(new Blob(["rendered PNG"], { type: "image/png" }));
  createStoryPhotoArchive
    .mockReset()
    .mockResolvedValue(new Blob(["ZIP"], { type: "application/zip" }));
  share = vi.fn().mockResolvedValue(undefined);
  canShare = vi.fn().mockReturnValue(true);
  vi.stubGlobal("navigator", { share, canShare });
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(props = {}) {
  const handlers = { onClose: vi.fn(), onDownload: vi.fn(), ...props };
  await act(async () =>
    root.render(
      <StoryPhotoSaveDialog
        photos={[photo()]}
        settings={settings}
        {...handlers}
      />,
    ),
  );
  return handlers;
}

describe("story photo native saving", () => {
  it("prepares photos sequentially, then shares the complete PNG batch in a fresh click", async () => {
    const first = deferred();
    const second = deferred();
    exportStoryPhoto
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const photos = Object.freeze([photo("../cards.jpg"), photo("cards.JPG")]);
    await render({ photos });
    expect(exportStoryPhoto).toHaveBeenCalledTimes(1);
    expect(exportStoryPhoto).toHaveBeenCalledWith(photos[0], settings);
    expect(button("Save to Photos / Share")).toBeUndefined();
    expect(button("Download ZIP (2)").disabled).toBe(true);
    expect(share).not.toHaveBeenCalled();
    await act(async () =>
      first.resolve(new Blob(["first"], { type: "image/png" })),
    );
    expect(exportStoryPhoto).toHaveBeenCalledTimes(2);
    expect(dialog().textContent).toContain("Preparing photo 2 of 2");
    expect(share).not.toHaveBeenCalled();
    await act(async () =>
      second.resolve(new Blob(["second"], { type: "image/png" })),
    );
    expect(dialog().textContent).toContain("2 photos ready");
    expect(share).not.toHaveBeenCalled();
    expect(canShare).toHaveBeenCalledWith({ files: expect.any(Array) });

    let inClick = false;
    share.mockImplementation(() => {
      expect(inClick).toBe(true);
      return Promise.resolve();
    });
    await act(async () => {
      inClick = true;
      button("Save to Photos / Share").click();
      inClick = false;
      expect(share).toHaveBeenCalledTimes(1);
    });
    const files = share.mock.calls[0][0].files;
    expect(files).toHaveLength(2);
    expect(
      files.every((file) => file instanceof File && file.type === "image/png"),
    ).toBe(true);
    expect(files.map((file) => file.name)).toEqual([
      "cards-story.png",
      "cards-story (2).png",
    ]);
    expect(share.mock.calls[0][0]).toEqual({ files });
    expect(dialog().textContent).toContain(
      "Check Photos if you chose Save Images",
    );
    expect(dialog().textContent.toLowerCase()).not.toContain("saved");
    expect(button("Download ZIP (2)").disabled).toBe(false);
  });

  it("treats a dismissed native sheet quietly and allows another share attempt", async () => {
    share.mockRejectedValueOnce(new DOMException("Dismissed", "AbortError"));
    await render();
    await act(async () => button("Save to Photos / Share").click());
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
    expect(dialog().textContent.toLowerCase()).not.toContain("saved");
    expect(dialog().textContent).not.toContain("Check Photos if");
    expect(button("Save to Photos / Share").disabled).toBe(false);
    await act(async () => button("Save to Photos / Share").click());
    expect(share).toHaveBeenCalledTimes(2);
  });

  it("opens only one share sheet on a double tap and ignores its completion after unmount", async () => {
    const pending = deferred();
    share.mockReturnValue(pending.promise);
    await render();
    await act(async () => {
      const action = button("Save to Photos / Share");
      action.click();
      action.click();
    });
    expect(share).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    root = null;
    await act(async () => pending.resolve());
    expect(dialog()).toBeNull();
  });

  it.each(["synchronous", "asynchronous"])(
    "offers a working fallback after a %s native sharing failure",
    async (mode) => {
      const error = new DOMException(
        "Sharing not available",
        "NotAllowedError",
      );
      if (mode === "synchronous")
        share.mockImplementation(() => {
          throw error;
        });
      else share.mockRejectedValue(error);
      const { onDownload } = await render();
      await act(async () => button("Save to Photos / Share").click());
      expect(dialog().querySelector('[role="alert"]').textContent).toContain(
        "use the download below",
      );
      expect(button("Download image").disabled).toBe(false);
      await act(async () => button("Download image").click());
      expect(onDownload).toHaveBeenCalledWith(
        expect.any(File),
        "cards-story.png",
      );
    },
  );

  it.each(["unsupported", "throwing", "missing"])(
    "offers a ZIP when file sharing is %s",
    async (mode) => {
      if (mode === "unsupported") canShare.mockReturnValue(false);
      if (mode === "throwing")
        canShare.mockImplementation(() => {
          throw new Error("Policy blocked");
        });
      if (mode === "missing") vi.stubGlobal("navigator", {});
      const { onDownload } = await render({
        photos: [photo(), photo("other.png")],
      });
      expect(button("Save to Photos / Share")).toBeUndefined();
      expect(dialog().textContent).toContain(
        "cannot share these images together",
      );
      expect(button("Download ZIP (2)").disabled).toBe(false);
      await act(async () => button("Download ZIP (2)").click());
      expect(createStoryPhotoArchive).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(File), expect.any(File)]),
      );
      expect(onDownload).toHaveBeenCalledWith(
        expect.objectContaining({ type: "application/zip" }),
        "rafchu-story-sale-2-photos.zip",
      );
      expect(share).not.toHaveBeenCalled();
    },
  );

  it("downloads one image synchronously without making a ZIP", async () => {
    canShare.mockReturnValue(false);
    let inClick = false;
    const onDownload = vi.fn(() => expect(inClick).toBe(true));
    await render({ onDownload });
    await act(async () => {
      inClick = true;
      button("Download image").click();
      inClick = false;
    });
    expect(onDownload).toHaveBeenCalledOnce();
    expect(createStoryPhotoArchive).not.toHaveBeenCalled();
  });

  it("retries a preparation error without changing the original photos", async () => {
    exportStoryPhoto.mockRejectedValueOnce(
      new Error("Photo could not be encoded."),
    );
    const photos = Object.freeze([photo()]);
    await render({ photos });
    expect(dialog().querySelector('[role="alert"]').textContent).toContain(
      "could not be encoded",
    );
    expect(button("Download image").disabled).toBe(true);
    await act(async () => button("Try preparing again").click());
    expect(exportStoryPhoto).toHaveBeenCalledTimes(2);
    expect(dialog().textContent).toContain("1 photo ready");
    expect(photos[0].labels[0]).toEqual({
      priceText: "€20",
      secondaryText: "$22",
    });
  });

  it("stops preparing later photos after closing the dialog", async () => {
    const pending = deferred();
    exportStoryPhoto.mockReturnValue(pending.promise);
    const { onClose } = await render({
      photos: [photo(), photo("second.png")],
    });
    await act(async () => button("Close save photos").click());
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () =>
      pending.resolve(new Blob(["PNG"], { type: "image/png" })),
    );
    expect(exportStoryPhoto).toHaveBeenCalledTimes(1);
    expect(canShare).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it("ignores a pending archive after unmount instead of starting a download", async () => {
    const pending = deferred();
    createStoryPhotoArchive.mockReturnValue(pending.promise);
    const { onDownload } = await render({
      photos: [photo(), photo("second.png")],
    });
    await act(async () => button("Download ZIP (2)").click());
    expect(createStoryPhotoArchive).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    root = null;
    await act(async () =>
      pending.resolve(new Blob(["ZIP"], { type: "application/zip" })),
    );
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("traps focus, closes on Escape, and restores the original focus and scrolling", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const previousOverflow = document.body.style.overflow;
    const { onClose } = await render();
    expect(document.activeElement).toBe(dialog().querySelector("h2"));
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    button("Download image").focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(button("Close save photos"));
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(button("Download image"));
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    root = null;
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe(previousOverflow);
    opener.remove();
  });
});
