import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIREBASE_AUTH_DOMAIN,
  PRODUCTION_FIREBASE_HOST,
  resolveFirebaseAuthDomain,
  shouldUseRedirectAuth,
} from "./authHelpers";

describe("resolveFirebaseAuthDomain", () => {
  it("uses the same-origin auth handler on Firebase Hosting production", () => {
    expect(resolveFirebaseAuthDomain(PRODUCTION_FIREBASE_HOST, DEFAULT_FIREBASE_AUTH_DOMAIN))
      .toBe(PRODUCTION_FIREBASE_HOST);
  });

  it("keeps the configured Firebase handler for local development", () => {
    expect(resolveFirebaseAuthDomain("127.0.0.1", DEFAULT_FIREBASE_AUTH_DOMAIN))
      .toBe(DEFAULT_FIREBASE_AUTH_DOMAIN);
  });
});

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
      PRODUCTION_FIREBASE_HOST,
    )).toBe(true);
  });

  it("keeps popup-first behavior on desktop", () => {
    expect(shouldUseRedirectAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0))
      .toBe(false);
  });
});
