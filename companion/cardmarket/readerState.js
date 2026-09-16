// Classify the document itself, so a failed server response is not confused
// with an empty search or a verification page that must be left intact.
export function cardmarketReaderState(root, mode) {
  const heading = root.querySelector('h1')?.textContent || '';
  const title = `${root.title || ''} ${heading}`;
  const verification = /just a moment|security verification|verify (?:you are|that you are) human|access denied/i.test(title)
    || [...root.querySelectorAll('h2')].some(el => /performing security verification/i.test(el.textContent));
  if (verification) return { ok: false, reason: 'verification' };
  const serverCode = title.match(/\b(502|503|504|520|521|522|523|524)\b/)?.[1];
  if (serverCode && /service unavailable|bad gateway|timeout|timed out|error|unreachable|server.*down/i.test(title)) {
    return { ok: false, reason: 'server-error', code: serverCode };
  }
  const ok = Boolean(root.querySelector(mode === 'products' ? '#SearchResultForm, #FilterForm' : '#FilterForm') && heading);
  return { ok, ...(!ok ? { reason: 'loading' } : {}) };
}
