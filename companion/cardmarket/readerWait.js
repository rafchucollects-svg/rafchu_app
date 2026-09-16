const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Content-script replies are immediate. Bound a lost reply as well as the
// outer wait, otherwise one message can leave the task running indefinitely.
async function ping(api, tabId, mode) {
  let timer;
  try {
    return await Promise.race([
      api.tabs.sendMessage(tabId, { channel: 'rafchu-cardmarket-reader', action: 'ping', ...(mode ? { mode } : {}) }),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); }),
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function waitForCardmarketReader(api, { tabId, mode, acceptsUrl, cancelled, resumeLabel, onProgress = async () => {} }) {
  const deadline = Date.now() + 40000;
  let retried = false, reason = 'loading', serverCode, progress;
  const checkCancelled = () => { if (cancelled()) throw new Error('Cardmarket task stopped.'); };
  const update = async message => { if (progress !== message) { progress = message; await onProgress(message); } };
  while (Date.now() < deadline) {
    checkCancelled();
    await pause(500);
    const tab = await api.tabs.get(tabId);
    if (tab.status !== 'complete' || !acceptsUrl(tab.url)) continue;
    const response = await ping(api, tabId, mode);
    checkCancelled();
    if (response?.ok) return;
    reason = response?.reason || 'loading';
    if (reason === 'verification') {
      // Only observe. Never interact with, refresh or bypass the challenge.
      await update('Waiting for Cardmarket verification. Complete any check in the reader; this task will continue if it clears.');
    } else if (reason === 'server-error') {
      serverCode = response.code;
      if (retried) break;
      await update(`Cardmarket returned a server error${serverCode ? ` (${serverCode})` : ''}. Retrying this page once…`);
      await pause(1500);
      checkCancelled();
      // Recheck before reloading: the page may have recovered or switched to
      // verification while the retry message was displayed.
      const current = await api.tabs.get(tabId);
      if (current.status !== 'complete' || !acceptsUrl(current.url)) continue;
      const latest = await ping(api, tabId, mode);
      checkCancelled();
      if (latest?.ok) return;
      if (latest?.reason !== 'server-error') continue;
      retried = true;
      await api.tabs.reload(tabId);
      await pause(1500);
    }
  }
  checkCancelled();
  const message = reason === 'verification'
    ? `Cardmarket needs browser verification. Open the reader, finish verification, then click ${resumeLabel}.`
    : reason === 'server-error'
      ? `Cardmarket returned a server error${serverCode ? ` (${serverCode})` : ''} after one retry. Earlier results are saved. Try ${resumeLabel} when Cardmarket recovers.`
      : `The Cardmarket page has not loaded. Open the reader, wait for results, then click ${resumeLabel}.`;
  throw Object.assign(new Error(message), { code: reason === 'server-error' ? 'server-error' : reason === 'verification' ? 'verification' : 'page-unavailable' });
}
