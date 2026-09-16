window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'rafchu-cardmarket-request') return;
  const { requestId, action, tasks } = event.data;
  if (typeof requestId !== 'string' || requestId.length > 100 || !['status', 'report', 'start', 'retry-failed', 'cancel', 'suggest', 'products', 'resume', 'resume-suggestions', 'open-reader'].includes(action)) return;
  let result;
  try { result = await chrome.runtime.sendMessage({ channel: 'rafchu-cardmarket', action, ...(['start', 'retry-failed', 'suggest'].includes(action) ? { tasks } : {}) }); }
  catch { result = { ok: false, error: 'Cardmarket companion disconnected. Reload this Rafchu tab.' }; }
  window.postMessage({ channel: 'rafchu-cardmarket-response', requestId, ...result }, location.origin);
});
