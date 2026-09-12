// Isolated content script: no cookies, tokens, or CardLadder account credentials.
window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'rafchu-companion-request') return;
  const { requestId, action } = event.data;
  if (typeof requestId !== 'string' || requestId.length > 100 || !['status', 'report', 'start', 'cancel'].includes(action)) return;
  let result;
  try { result = await chrome.runtime.sendMessage({ channel: 'rafchu-companion', action }); }
  catch { result = { ok: false, error: 'Companion disconnected. Reload this app tab.' }; }
  window.postMessage({ channel: 'rafchu-companion-response', requestId, ...result }, location.origin);
});
