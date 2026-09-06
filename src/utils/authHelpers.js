export const DEFAULT_FIREBASE_AUTH_DOMAIN = "rafchu-tcg-app.firebaseapp.com";

/**
 * Production always uses the same-origin redirect helper so login does not
 * depend on popup support. Local desktop browsers use a popup first, with
 * AppWrapper retaining its redirect fallback for blocked environments.
 */
export function shouldUseRedirectAuth(userAgent = "", maxTouchPoints = 0, hostname = "") {
  if (hostname === DEFAULT_FIREBASE_AUTH_DOMAIN) return true;
  const embeddedBrowser = /FBAN|FBAV|Instagram|Line|TikTok|MicroMessenger|Snapchat|Pinterest|LinkedInApp/i.test(userAgent);
  const mobileBrowser = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const desktopModeIPad = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
  return embeddedBrowser || mobileBrowser || desktopModeIPad;
}
