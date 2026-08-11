export const DEFAULT_FIREBASE_AUTH_DOMAIN = "rafchu-tcg-app.firebaseapp.com";
export const PRODUCTION_FIREBASE_HOST = "rafchu-tcg-app.web.app";

/**
 * Keep production auth helpers on the same Firebase Hosting origin. This is
 * required for redirect sign-in on browsers that partition third-party
 * storage. Local development continues to use the firebaseapp.com helper.
 */
export function resolveFirebaseAuthDomain(hostname, configuredAuthDomain) {
  if (hostname === PRODUCTION_FIREBASE_HOST) return PRODUCTION_FIREBASE_HOST;
  return configuredAuthDomain || DEFAULT_FIREBASE_AUTH_DOMAIN;
}

/**
 * Production always uses the same-origin redirect helper so login does not
 * depend on popup support. Local desktop browsers use a popup first, with
 * AppWrapper retaining its redirect fallback for blocked environments.
 */
export function shouldUseRedirectAuth(userAgent = "", maxTouchPoints = 0, hostname = "") {
  if (hostname === PRODUCTION_FIREBASE_HOST) return true;
  const embeddedBrowser = /FBAN|FBAV|Instagram|Line|TikTok|MicroMessenger|Snapchat|Pinterest|LinkedInApp/i.test(userAgent);
  const mobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const desktopModeIPad = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
  return embeddedBrowser || mobileBrowser || desktopModeIPad;
}
