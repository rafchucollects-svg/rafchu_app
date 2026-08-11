import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIREBASE_AUTH_DOMAIN,
  shouldUseRedirectAuth,
} from "./authHelpers";

describe("shouldUseRedirectAuth", () => {
  it("uses redirects for mobile and embedded browsers", () => {
    expect(shouldUseRedirectAuth("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile"))
      .toBe(true);
    expect(shouldUseRedirectAuth("Mozilla/5.0 Instagram"))
      .toBe(true);
    expect(shouldUseRedirectAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5))
      .toBe(true);
  });

  it("uses the same-origin redirect on production desktop browsers", () => {
    expect(shouldUseRedirectAuth(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      0,
      DEFAULT_FIREBASE_AUTH_DOMAIN,
    )).toBe(true);
  });

  it("keeps popup-first behavior on desktop", () => {
    expect(shouldUseRedirectAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0))
      .toBe(false);
  });
});
