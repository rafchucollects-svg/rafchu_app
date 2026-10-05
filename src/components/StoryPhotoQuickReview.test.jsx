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

vi.hoisted(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => ({ rates: { USD: 1, EUR: 0.92, GBP: 0.79 } }),
    })),
  );
});
import { StoryPhotoQuickReview } from "./StoryPhotoQuickReview";

let host, root, current;
const labels = () => [
  {
    id: "first",
    name: "Pikachu",
    price: "12",
    condition: "NM",
    needsPositionReview: true,
  },
  {
    id: "second",
    name: "Charmander",
    price: "25",
    condition: "LP",
    needsPositionReview: false,
  },
];
const byLabel = (label) => host.querySelector(`[aria-label="${label}"]`);
const button = (text) =>
  [...host.querySelectorAll("button")].find(
    (element) => element.textContent.trim() === text,
  );
const paint = () => root.render(<StoryPhotoQuickReview {...current} />);
const show = (overrides = {}) => {
  const photo = {
    id: "photo-one",
    status: "review",
    labels: labels(),
    ...overrides.photo,
  };
  current = {
    currency: "EUR",
    photoIndex: 0,
    photoCount: 3,
    selectedLabel: photo.labels[0] || null,
    selectedCondition: photo.labels[0]?.condition || "",
    isGraded: false,
    onPreviousPhoto: vi.fn(),
    onNextPhoto: vi.fn(),
    onConfirmLabel: vi.fn(),
    onConfirmPhoto: vi.fn(),
    onSelectLabel: vi.fn((id) => {
      current = {
        ...current,
        selectedLabel: current.photo.labels.find((entry) => entry.id === id),
      };
      current.selectedCondition = current.selectedLabel.condition || "";
      paint();
    }),
    onUpdateLabel: vi.fn((id, patch) => {
      const updated = current.photo.labels.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      );
      current = {
        ...current,
        photo: { ...current.photo, labels: updated },
        selectedLabel: updated.find(
          (entry) => entry.id === current.selectedLabel.id,
        ),
      };
      current.selectedCondition = current.selectedLabel.condition || "";
      paint();
    }),
    ...overrides,
    photo,
  };
  act(paint);
};
const click = (element) => {
  expect(element).toBeTruthy();
  expect(element.disabled).not.toBe(true);
  act(() => element.click());
};
const editPrice = (value) => {
  const input = byLabel("Quick price");
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
afterAll(() => vi.unstubAllGlobals());

describe("StoryPhotoQuickReview", () => {
  it("edits the selected price and condition, rounds on blur, and confirms a provisional position", () => {
    show();
    expect(host.textContent).toContain("Card 1 of 2");
    expect(host.textContent).toContain("Pikachu");
    editPrice("12,50");
    expect(current.onUpdateLabel).toHaveBeenLastCalledWith("first", {
      price: "12,50",
      priceSource: "manual",
      confirmed: false,
    });
    act(() =>
      byLabel("Quick price").dispatchEvent(
        new FocusEvent("focusout", { bubbles: true }),
      ),
    );
    expect(byLabel("Quick price").value).toBe("13");
    act(() => {
      byLabel("Quick condition").value = "LP";
      byLabel("Quick condition").dispatchEvent(
        new Event("change", { bubbles: true }),
      );
    });
    expect(current.onUpdateLabel).toHaveBeenLastCalledWith("first", {
      condition: "LP",
      isGraded: false,
      confirmed: false,
    });
    expect(byLabel("Quick condition").selectedOptions[0].textContent).toBe(
      "Excellent (EX)",
    );
    expect(current.selectedLabel.needsPositionReview).toBe(true);
    expect(host.textContent).toContain(
      "Confirming accepts the displayed prices and label positions",
    );
    expect(host.textContent).toContain("download without confirming");
    click(button("Confirm & next"));
    expect(current.onConfirmLabel).toHaveBeenCalledExactlyOnceWith("first");
    click(button("Confirm photo & next"));
    expect(current.onConfirmPhoto).toHaveBeenCalledOnce();
  });

  it("blocks confirmation for invalid prices and recovers when a positive price is entered", () => {
    show();
    for (const value of ["", "0", "-8", "not a price", "12.345"]) {
      editPrice(value);
      expect(byLabel("Quick price").getAttribute("aria-invalid"), value).toBe(
        "true",
      );
      expect(button("Confirm & next").disabled, value).toBe(true);
      expect(button("Confirm photo & next").disabled, value).toBe(true);
    }
    expect(host.textContent).toContain("Enter a price greater than zero");
    expect(current.onConfirmLabel).not.toHaveBeenCalled();
    editPrice("7.25");
    act(() =>
      byLabel("Quick price").dispatchEvent(
        new FocusEvent("focusout", { bubbles: true }),
      ),
    );
    expect(byLabel("Quick price").value).toBe("7");
    expect(byLabel("Quick price").getAttribute("aria-invalid")).toBe("false");
    expect(button("Confirm & next").disabled).toBe(false);
  });

  it("allows confirming the selected card while another card still needs a price", () => {
    const unpriced = labels();
    unpriced[1].price = "";
    show({ photo: { labels: unpriced } });
    expect(button("Confirm & next").disabled).toBe(false);
    expect(button("Confirm photo & next").disabled).toBe(true);
    click(button("Confirm & next"));
    expect(current.onConfirmLabel).toHaveBeenCalledExactlyOnceWith("first");
    expect(current.onConfirmPhoto).not.toHaveBeenCalled();
  });

  it("navigates cards independently from photos and respects each boundary", () => {
    show();
    expect(host.textContent).toContain("Photo 1 of 3");
    expect(byLabel("Previous photo").disabled).toBe(true);
    expect(byLabel("Previous card").disabled).toBe(true);
    click(byLabel("Next card"));
    expect(current.onSelectLabel).toHaveBeenLastCalledWith("second");
    expect(host.textContent).toContain("Card 2 of 2");
    expect(byLabel("Quick price").value).toBe("25");
    expect(byLabel("Next card").disabled).toBe(true);
    click(byLabel("Previous card"));
    expect(current.onSelectLabel).toHaveBeenLastCalledWith("first");
    click(byLabel("Next photo"));
    expect(current.onNextPhoto).toHaveBeenCalledOnce();
    current = { ...current, photoIndex: 2 };
    act(paint);
    expect(host.textContent).toContain("Photo 3 of 3");
    expect(byLabel("Next photo").disabled).toBe(true);
    click(byLabel("Previous photo"));
    expect(current.onPreviousPhoto).toHaveBeenCalledOnce();
  });

  it("shows grading information instead of raw condition controls for a slab", () => {
    show({
      photo: {
        labels: [
          { ...labels()[0], isGraded: true, gradingCompany: "PSA", grade: "9" },
        ],
      },
      isGraded: true,
    });
    expect(byLabel("Quick condition")).toBeNull();
    expect(host.textContent).toContain("Graded card");
    expect(host.textContent).toContain("PSA 9");
    expect(byLabel("Previous card").disabled).toBe(true);
    expect(byLabel("Next card").disabled).toBe(true);
    expect(button("Confirm photo & next").disabled).toBe(false);
  });

  it.each([
    { photo: { status: "scanning" } },
    { photo: { status: "queued" } },
    { disabled: true },
  ])(
    "disables edits and confirmation during pending work (%j)",
    (overrides) => {
      show(overrides);
      expect(byLabel("Quick price").disabled).toBe(true);
      expect(byLabel("Quick condition").disabled).toBe(true);
      expect(byLabel("Next card").disabled).toBe(true);
      expect(button("Confirm & next").disabled).toBe(true);
      expect(button("Confirm photo & next").disabled).toBe(true);
    },
  );

  it("keeps photo navigation available without enabling confirmation for an empty photo", () => {
    show({ photo: { labels: [] } });
    expect(byLabel("Quick price")).toBeNull();
    expect(button("Confirm photo & next")).toBeUndefined();
    expect(host.textContent).toContain(
      "Scan this photo or add a price label to start",
    );
    click(byLabel("Next photo"));
    expect(current.onNextPhoto).toHaveBeenCalledOnce();
  });
});
