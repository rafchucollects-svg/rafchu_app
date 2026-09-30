import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  app: {},
  scan: vi.fn(),
  callable: vi.fn(),
  prepare: vi.fn(),
  exportPhoto: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  createUrl: vi.fn(),
  revokeUrl: vi.fn(),
  archive: vi.fn(),
}));
vi.hoisted(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => ({ rates: { USD: 1, EUR: 0.92, GBP: 0.79 } }),
    })),
  );
});
vi.mock("@/contexts/AppContext", () => ({ useApp: () => mocks.app }));
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: (...args) => mocks.callable(...args),
}));
vi.mock("@/utils/storyPhotoMedia", async (importOriginal) => ({
  ...(await importOriginal()),
  prepareStoryPhoto: (...args) => mocks.prepare(...args),
  exportStoryPhoto: (...args) => mocks.exportPhoto(...args),
}));
vi.mock("@/utils/storyPhotoDraft", () => ({
  loadStoryDraft: (...args) => mocks.loadDraft(...args),
  saveStoryDraft: (...args) => mocks.saveDraft(...args),
}));
vi.mock("@/utils/storyPhotoArchive", () => ({
  createStoryPhotoArchive: (...args) => mocks.archive(...args),
}));

import { PhotoStoryStudio } from "./PhotoStoryStudio";
import { formatStoryPrice } from "@/utils/storyPhotoMatching";
import { positionPhotoLabels } from "@/utils/storyPhotoMedia";

let host, root, downloaded;
const card = (patch = {}) => ({
  entryId: "pikachu",
  name: "Pikachu",
  set: "Base Set",
  number: "58/102",
  language: "English",
  isGraded: false,
  condition: "NM",
  overridePrice: 12.5,
  overridePriceCurrency: "EUR",
  quantity: 1,
  ...patch,
});
const detection = (patch = {}) => ({
  name: "Pikachu",
  setName: "Base Set",
  collectorNumber: "58/102",
  language: "EN",
  isGraded: false,
  confidence: 0.97,
  position: { x: 0.12, y: 0.16, width: 0.3, height: 0.52 },
  ...patch,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const button = (text) =>
  [...host.querySelectorAll("button")].find(
    (element) => element.textContent.trim() === text,
  );
const byLabel = (label) => host.querySelector(`[aria-label="${label}"]`);
const click = async (element) => {
  expect(element).toBeTruthy();
  expect(element.disabled).not.toBe(true);
  await act(async () => element.click());
};
const editInput = async (label, value) => {
  const input = byLabel(label);
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const blurInput = async (label) => {
  await act(async () =>
    byLabel(label).dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
};
const selectOption = async (label, value) => {
  const select = byLabel(label);
  expect(select).toBeTruthy();
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const renderStudio = async () => {
  await act(async () => root.render(<PhotoStoryStudio />));
};
const uploadFiles = async (names) => {
  const files = names.map(
    (name) => new File(["original photo bytes"], name, { type: "image/jpeg" }),
  );
  await act(async () => {
    const input = byLabel("Choose photo files");
    Object.defineProperty(input, "files", { value: files, configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return files;
};
const upload = async (name = "tabletop.jpg") => (await uploadFiles([name]))[0];

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.app = {
    user: { uid: "photo-studio-test" },
    collectionItems: [card()],
    currency: "EUR",
    secondaryCurrency: "GBP",
    roundUpPrices: false,
  };
  for (const value of Object.values(mocks))
    if (vi.isMockFunction(value)) value.mockReset();
  mocks.callable.mockReturnValue(mocks.scan);
  mocks.scan.mockResolvedValue({ data: { cards: [detection()] } });
  mocks.prepare.mockImplementation(async (file) => ({
    id: `photo-${file.name}`,
    name: file.name,
    blob: new Blob(["prepared photo"], { type: "image/png" }),
    width: 1200,
    height: 900,
    scanBase64: "reduced-photo",
    scanMimeType: "image/jpeg",
  }));
  mocks.exportPhoto.mockResolvedValue(
    new Blob(["exported photo"], { type: "image/png" }),
  );
  mocks.archive.mockResolvedValue(
    new Blob(["zip archive"], { type: "application/zip" }),
  );
  mocks.loadDraft.mockResolvedValue(null);
  mocks.saveDraft.mockResolvedValue(undefined);
  let nextUrl = 0;
  mocks.createUrl.mockImplementation(() => `blob:photo-test-${++nextUrl}`);
  const BrowserURL = globalThis.URL;
  vi.stubGlobal(
    "URL",
    class extends BrowserURL {
      static createObjectURL = mocks.createUrl;
      static revokeObjectURL = mocks.revokeUrl;
    },
  );
  downloaded = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function () {
      downloaded.push({ href: this.href, name: this.download });
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
afterAll(() => vi.unstubAllGlobals());

describe("PhotoStoryStudio", () => {
  it("automatically applies whole-unit prices and raw-card conditions without requiring confirmation", async () => {
    await renderStudio();
    const original = await upload();
    expect(mocks.prepare).toHaveBeenCalledWith(original);
    expect(mocks.callable).toHaveBeenCalledWith(
      expect.anything(),
      "parseCardPhoto",
      { timeout: 70000 },
    );
    expect(mocks.scan).toHaveBeenCalledExactlyOnceWith({
      imageBase64: "reduced-photo",
      mimeType: "image/jpeg",
    });
    expect(byLabel("Label price").value).toBe("13");
    expect(byLabel("Card condition").value).toBe("NM");
    expect(host.textContent).toContain("1 of 1 photos ready");
    const preview = byLabel("Move price label 1: Pikachu");
    expect(preview.textContent).toContain(formatStoryPrice(13, "EUR"));
    expect(preview.textContent).not.toContain(".00");
    await click(button("Download photo"));
    const [photo, settings] = mocks.exportPhoto.mock.calls[0];
    expect(photo.blob).toBe((await mocks.prepare.mock.results[0].value).blob);
    expect(photo.labels[0]).toMatchObject({
      ...positionPhotoLabels([detection()])[0],
      itemKey: "pikachu",
      confirmed: true,
      price: "13",
      priceText: formatStoryPrice(13, "EUR"),
      condition: "NM",
      isGraded: false,
    });
    expect(settings).toMatchObject({
      format: "original",
      currency: "EUR",
      showCondition: true,
    });
    expect(downloaded).toEqual([
      { href: expect.stringMatching(/^blob:/), name: "tabletop-prices.png" },
    ]);
    expect(mocks.app.collectionItems[0].overridePrice).toBe(12.5);
  });

  it("applies a best-match price immediately and lets an inventory correction update both price and condition", async () => {
    mocks.app.collectionItems.push(
      card({
        entryId: "pikachu-excellent",
        condition: "EX",
        overridePrice: 18.75,
      }),
    );
    await renderStudio();
    await upload();
    expect(byLabel("Label price").value).toBe("13");
    expect(byLabel("Card condition").value).toBe("NM");
    expect(button("Download photo").disabled).toBe(false);
    await click(button("Download photo"));
    expect(mocks.exportPhoto.mock.calls[0][0].labels[0]).toMatchObject({
      itemKey: "pikachu",
      price: "13",
      condition: "NM",
      confirmed: false,
    });

    const alternative = [
      ...host.querySelectorAll(".photo-studio-suggestions button"),
    ].find((element) => element.textContent.includes("EX"));
    await click(alternative);
    expect(byLabel("Label price").value).toBe("19");
    expect(byLabel("Card condition").selectedOptions[0].textContent).toBe(
      "Excellent (EX)",
    );
    expect(button("Download photo").disabled).toBe(false);
    await click(button("Download photo"));
    expect(mocks.exportPhoto.mock.calls[1][0].labels[0]).toMatchObject({
      itemKey: "pikachu-excellent",
      price: "19",
      condition: "EX",
      isGraded: false,
    });

    await selectOption("Card condition", "MP");
    expect(byLabel("Card condition").selectedOptions[0].textContent).toBe(
      "Good (GD)",
    );
    await click(button("Download photo"));
    expect(mocks.exportPhoto.mock.calls[2][0].labels[0].condition).toBe("MP");
    expect(mocks.app.collectionItems[1].condition).toBe("EX");
    expect(mocks.app.collectionItems[1].overridePrice).toBe(18.75);
  });

  it("automatically prices a clear slab match despite unread set metadata and omits raw-card condition controls", async () => {
    mocks.app.collectionItems = [
      card({
        isGraded: true,
        grade: "9",
        gradingCompany: "PSA",
        overridePrice: undefined,
        gradedPrice: 49.6,
        gradedPriceCurrency: "EUR",
      }),
    ];
    mocks.scan.mockResolvedValue({
      data: {
        cards: [
          detection({
            isGraded: true,
            grade: "9",
            gradingCompany: "PSA",
            setName: null,
          }),
        ],
      },
    });
    await renderStudio();
    await upload();
    expect(byLabel("Label price").value).toBe("50");
    expect(byLabel("Card condition")).toBeNull();
    expect(button("Download photo").disabled).toBe(false);
    await click(button("Download photo"));
    expect(mocks.exportPhoto.mock.calls[0][0].labels[0]).toMatchObject({
      itemKey: "pikachu",
      price: "50",
      priceText: formatStoryPrice(50, "EUR"),
      isGraded: true,
    });
  });

  it("recovers from scanner failure with a custom price and explicit placement confirmation", async () => {
    mocks.app.collectionItems = [];
    mocks.scan.mockRejectedValue(new Error("Scanning is unavailable"));
    await renderStudio();
    await upload();
    expect(host.querySelector('[role="alert"]').textContent).toContain(
      "could not be scanned",
    );
    expect(button("Download photo").disabled).toBe(true);
    await click(button("Add a price label"));
    await editInput("Label name", "My card");
    await editInput("Label price", "12,50");
    await blurInput("Label price");
    expect(byLabel("Label price").value).toBe("13");
    expect(button("Download photo").disabled).toBe(true);
    const placement = [...host.querySelectorAll("label")].find((element) =>
      element.textContent.includes("This label is on the correct card"),
    );
    await click(placement.querySelector("input"));
    await click(button("Download photo"));
    expect(mocks.exportPhoto.mock.calls[0][0].labels[0]).toMatchObject({
      name: "My card",
      price: "13",
      priceText: formatStoryPrice(13, "EUR"),
      needsPositionReview: false,
      itemKey: null,
    });
  });

  it("never exports a matched inventory card without a positive sale price", async () => {
    mocks.app.collectionItems = [card({ overridePrice: 0 })];
    await renderStudio();
    await upload();
    expect(byLabel("Label price").value).toBe("");
    expect(button("Download photo").disabled).toBe(true);
    expect(host.textContent).toContain("Enter a price greater than zero");
    for (const invalid of ["0", "-5", "Infinity", "12.345"]) {
      await editInput("Label price", invalid);
      expect(button("Download photo").disabled, invalid).toBe(true);
    }
    expect(mocks.exportPhoto).not.toHaveBeenCalled();
    await editInput("Label price", "7.25");
    await blurInput("Label price");
    expect(byLabel("Label price").value).toBe("7");
    expect(button("Download photo").disabled).toBe(false);
  });

  it("ignores a late scan result after its photo is removed", async () => {
    const scan = deferred();
    mocks.scan.mockReturnValue(scan.promise);
    await renderStudio();
    await upload();
    expect(host.textContent).toContain("Finding cards & prices");
    await click(byLabel("Remove current photo"));
    expect(byLabel("Your sale photos")).toBeNull();
    await act(async () => scan.resolve({ data: { cards: [detection()] } }));
    expect(byLabel("Your sale photos")).toBeNull();
    expect(byLabel("Label price")).toBeNull();
    expect(host.textContent).toContain("Start with your own photos");
    expect(mocks.exportPhoto).not.toHaveBeenCalled();
    expect(mocks.revokeUrl).toHaveBeenCalledWith("blob:photo-test-1");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.saveDraft.mock.lastCall[1].photos).toEqual([]);
  });

  it("restores a legacy draft with rounded prices, inventory conditions and its saved currency without rescanning", async () => {
    mocks.app.currency = "USD";
    const blob = new Blob(["saved photo"], { type: "image/png" });
    const savedPhoto = {
      id: "restored-photo",
      name: "saved.jpg",
      blob,
      width: 1200,
      height: 900,
      labels: [
        {
          id: "saved-label",
          name: "Saved card",
          itemKey: "pikachu",
          price: "31.75",
          x: 0.3,
          y: 0.7,
          width: 0.24,
          confirmed: true,
          needsPositionReview: false,
        },
      ],
    };
    mocks.loadDraft.mockResolvedValue({
      activeId: "restored-photo",
      photos: [savedPhoto],
      settings: {
        format: "story",
        currency: "EUR",
        labelScale: 1.2,
        labelColor: "#ffffff",
        labelBackground: "#111827",
        includeSecondary: false,
      },
    });
    await renderStudio();
    expect(mocks.loadDraft).toHaveBeenCalledWith("photo-studio-test");
    expect(host.textContent).toContain(
      "Your saved photo draft is ready to continue",
    );
    expect(byLabel("Label price").value).toBe("32");
    expect(byLabel("Card condition").value).toBe("NM");
    expect(byLabel("Export size").value).toBe("story");
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.scan).not.toHaveBeenCalled();
    await click(button("Download photo"));
    expect(mocks.exportPhoto.mock.calls[0][0]).toMatchObject({
      id: savedPhoto.id,
      blob,
      labels: [
        {
          ...savedPhoto.labels[0],
          price: "32",
          priceText: formatStoryPrice(32, "EUR"),
          condition: "NM",
          isGraded: false,
        },
      ],
    });
    expect(mocks.exportPhoto.mock.calls[0][1]).toMatchObject({
      currency: "EUR",
      format: "story",
      labelScale: 1.2,
      showCondition: true,
    });
  });

  it("fills a linked legacy draft's missing inventory price but preserves a price the user clears afterward", async () => {
    mocks.loadDraft.mockResolvedValue({
      activeId: "legacy-linked-photo",
      photos: [
        {
          id: "legacy-linked-photo",
          name: "legacy.jpg",
          blob: new Blob(["saved photo"], { type: "image/png" }),
          width: 1200,
          height: 900,
          labels: [
            {
              id: "legacy-linked-label",
              name: "Pikachu",
              itemKey: "pikachu",
              detected: detection(),
              price: "",
              x: 0.3,
              y: 0.7,
              width: 0.24,
              confirmed: false,
              needsPositionReview: false,
            },
          ],
        },
      ],
    });
    await renderStudio();
    expect(byLabel("Label price").value).toBe("13");
    expect(byLabel("Card condition").value).toBe("NM");
    expect(button("Download photo").disabled).toBe(false);
    expect(mocks.scan).not.toHaveBeenCalled();

    await editInput("Label price", "");
    mocks.app.collectionItems = [card({ overridePrice: 20 })];
    await renderStudio();
    expect(byLabel("Label price").value).toBe("");
    expect(button("Download photo").disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.saveDraft.mock.lastCall[1].photos[0].labels[0]).toMatchObject({
      itemKey: "pikachu",
      price: "",
      priceSource: "manual",
    });
    expect(downloaded).toEqual([]);
  });

  it("preserves measured placement when a second card needs a manual placement check", async () => {
    const second = detection({
      name: "Charmander",
      collectorNumber: "46/102",
      position: null,
    });
    mocks.app.collectionItems.push(
      card({
        entryId: "charmander",
        name: "Charmander",
        number: "46/102",
        overridePrice: 8.25,
      }),
    );
    mocks.scan.mockResolvedValue({ data: { cards: [detection(), second] } });
    await renderStudio();
    await upload();
    expect(button("Download photo").disabled).toBe(true);
    await click(byLabel("Move price label 2: Charmander"));
    const placement = [...host.querySelectorAll("label")].find((element) =>
      element.textContent.includes("This label is on the correct card"),
    );
    await click(placement.querySelector("input"));
    await click(button("Download photo"));
    const labels = mocks.exportPhoto.mock.calls[0][0].labels;
    expect(labels[0]).toMatchObject({
      ...positionPhotoLabels([detection()])[0],
      confirmed: true,
    });
    expect(labels[1]).toMatchObject({
      name: "Charmander",
      price: "8",
      needsPositionReview: false,
    });
  });

  it("keeps manual edits when a cancelled scan later returns", async () => {
    const scan = deferred();
    mocks.scan.mockReturnValue(scan.promise);
    await renderStudio();
    await upload();
    await click(button("Continue manually"));
    await click(button("Add a price label"));
    await editInput("Label name", "Keep my custom label");
    await editInput("Label price", "19.95");
    await act(async () => scan.resolve({ data: { cards: [detection()] } }));
    expect(byLabel("Label name").value).toBe("Keep my custom label");
    expect(byLabel("Label price").value).toBe("19.95");
    expect(byLabel("Move price label 1: Pikachu")).toBeNull();
    expect(host.querySelectorAll(".photo-studio-price")).toHaveLength(1);
  });

  it("queues a batch one scan at a time and advances after cancellation without applying the stale result", async () => {
    const firstScan = deferred();
    const secondScan = deferred();
    mocks.scan
      .mockReturnValueOnce(firstScan.promise)
      .mockReturnValueOnce(secondScan.promise);
    mocks.app.collectionItems.push(
      card({
        entryId: "charmander",
        name: "Charmander",
        number: "46/102",
        overridePrice: 8.25,
      }),
    );
    await renderStudio();
    await uploadFiles(["first.jpg", "second.jpg"]);
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.scan).toHaveBeenCalledTimes(1);
    expect(byLabel("Edit photo 1: first.jpg").textContent).toContain(
      "Scanning",
    );
    expect(byLabel("Edit photo 2: second.jpg").textContent).toContain("Queued");
    expect(button("Choose photos").disabled).toBe(false);

    await click(button("Continue manually"));
    expect(mocks.scan).toHaveBeenCalledTimes(2);
    expect(byLabel("Edit photo 1: first.jpg").textContent).toContain("Review");
    expect(byLabel("Edit photo 2: second.jpg").textContent).toContain(
      "Scanning",
    );
    await click(button("Add a price label"));
    await editInput("Label name", "Manually priced first photo");
    await editInput("Label price", "24.75");
    await act(async () =>
      firstScan.resolve({ data: { cards: [detection()] } }),
    );
    expect(byLabel("Label name").value).toBe("Manually priced first photo");
    expect(byLabel("Label price").value).toBe("24.75");
    expect(byLabel("Move price label 1: Pikachu")).toBeNull();
    expect(byLabel("Edit photo 2: second.jpg").textContent).toContain(
      "Scanning",
    );

    await act(async () =>
      secondScan.resolve({
        data: {
          cards: [detection({ name: "Charmander", collectorNumber: "46/102" })],
        },
      }),
    );
    await click(byLabel("Edit photo 2: second.jpg"));
    expect(byLabel("Label name").value).toBe("Charmander");
    expect(byLabel("Label price").value).toBe("8");
    expect(button("Download photo").disabled).toBe(false);
    expect(mocks.scan).toHaveBeenCalledTimes(2);
  });

  it("downloads one ZIP containing only ready photos while leaving an unfinished photo in the draft", async () => {
    const photo = (id, name, price, confirmed = true) => ({
      id,
      name,
      blob: new Blob([name], { type: "image/png" }),
      width: 1200,
      height: 900,
      labels: [
        {
          id: `${id}-label`,
          name: `${id} card`,
          price,
          x: 0.5,
          y: 0.8,
          width: 0.24,
          confirmed,
          needsPositionReview: false,
        },
      ],
    });
    mocks.loadDraft.mockResolvedValue({
      activeId: "unfinished",
      photos: [
        photo("ready-one", "first.jpg", "12.50"),
        photo("unfinished", "review.jpg", "", false),
        photo("ready-two", "last.jpg", "31.75"),
      ],
    });
    await renderStudio();
    expect(host.textContent).toContain("2 of 3 photos ready");
    expect(button("Download photo").disabled).toBe(true);
    await click(button("Download ZIP (2)"));

    expect(mocks.exportPhoto).toHaveBeenCalledTimes(2);
    expect(mocks.exportPhoto.mock.calls.map(([entry]) => entry.id)).toEqual([
      "ready-one",
      "ready-two",
    ]);
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    const files = mocks.archive.mock.calls[0][0];
    expect(files.map((file) => file.name)).toEqual([
      "first-prices.png",
      "last-prices.png",
    ]);
    expect(
      files.every(
        (file) =>
          file instanceof File && file.type === "image/png" && file.size > 0,
      ),
    ).toBe(true);
    expect(downloaded).toEqual([
      { href: expect.stringMatching(/^blob:/), name: "rafchu-story-sale.zip" },
    ]);
    expect(mocks.createUrl.mock.lastCall[0].type).toBe("application/zip");
    expect(byLabel("Edit photo 2: review.jpg").textContent).toContain("Review");
    expect(byLabel("Your sale photos").querySelectorAll("button")).toHaveLength(
      3,
    );
  });
});
