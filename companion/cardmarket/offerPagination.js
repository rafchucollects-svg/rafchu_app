const disabled = element => Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true');

function hidden(element, root) {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return true;
  const style = (root.defaultView || element.ownerDocument?.defaultView)?.getComputedStyle(element) || element.style;
  return style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility);
}

function visible(element, root) {
  for (let current = element; current?.nodeType === 1; current = current.parentElement) {
    if (hidden(current, root)) return false;
  }
  return true;
}

// Cardmarket leaves its disabled Load more button in the DOM with display:none
// after the final response. Its presence alone does not mean another page exists.
export function readCardmarketPagination(root) {
  const controls = [...root.querySelectorAll('button')].filter(element => element.id === 'loadMoreButton' || /Show\s+more\s+results/i.test(element.textContent));
  const available = controls.filter(element => visible(element, root));
  const notice = root.querySelector('#MaxResultsReachedNotice');
  const limitReached = Boolean(notice && visible(notice, root));
  const busy = Boolean(root.querySelector('#loadMore[aria-busy="true"], #loadMore [aria-busy="true"], #loadMoreButton[aria-busy="true"]'));
  const loading = busy || available.some(disabled);
  // A known, disabled, directly hidden button is the site's explicit terminal
  // state. A removed button can instead be an AJAX gap and needs row progress.
  const exhausted = !limitReached && !busy && controls.some(element => element.id === 'loadMoreButton' && disabled(element) && hidden(element, root));
  return { button: !busy && available.find(element => !disabled(element)) || null,
    loading, exhausted, limitReached, complete: !limitReached && !busy && available.length === 0 };
}
