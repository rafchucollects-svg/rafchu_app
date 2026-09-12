import { parseSaleDate, safeSaleUrl, safeCardLadderImage } from '../../src/utils/cardLadderSales.js';
import { currencyFromAccountLabel, isCardLadderCurrency, parseCardLadderMoney } from '../../src/utils/cardLadderCurrency.js';

export const textOf = element => (element?.innerText ?? element?.textContent ?? '').trim();
export function statValue(root, label) {
  const stat = [...root.querySelectorAll('.stat-item')].find(element => textOf(element.querySelector('label')).toLowerCase() === label.toLowerCase());
  return textOf(stat?.querySelector('.value'));
}

export function readAccountCurrency(root) {
  const label = [...root.querySelectorAll('label')].find(element => textOf(element) === 'Currency');
  return currencyFromAccountLabel(textOf(label?.parentElement.querySelector('.value')));
}

export function readCollectionRows(root, base = 'https://app.cardladder.com', currency) {
  if (!isCardLadderCurrency(currency)) throw new Error('Could not read CardLadder’s display currency. Open Account → Display Settings and retry.');
  return [...root.querySelectorAll('a.card-list-item[href*="cardId="]')].map(element => {
    const url = new URL(element.getAttribute('href'), base);
    const nameLine = textOf(element.querySelector('.card-name'));
    const name = nameLine.replace(/\s*#[\w/-]+\s*$/, '').trim();
    const number = /#([\w/-]+)/.exec(nameLine)?.[1] || '';
    const gradeText = textOf(element.querySelector('.grade-variation-chip:not(.variation)')).replace(/arrow_drop_down/g, '').trim();
    const gradeMatch = /^(PSA|BGS|CGC|SGC)\s+(\d+(?:\.\d+)?)$/i.exec(gradeText);
    const variation = textOf(element.querySelector('.grade-variation-chip.variation'));
    return { holdingId: url.searchParams.get('cardId'), collectionUrl: url.href, name, number,
      set: textOf(element.querySelector('.card-set')), variation,
      currency, cardLadderValue: parseCardLadderMoney(statValue(element, 'Value'), currency), cardLadderValueCurrency: currency,
      imageUrl: [...element.querySelectorAll('img')].flatMap(img => [img.getAttribute('data-src'), img.currentSrc, img.getAttribute('src')]).map(safeCardLadderImage).find(Boolean) || null,
      gradingCompany: gradeMatch?.[1]?.toUpperCase() || gradeText || 'Unspecified', grade: gradeMatch?.[2] || 'unsupported',
      sales: [], complete: false };
  });
}

export function readSalesRows(root, currency) {
  if (!isCardLadderCurrency(currency)) throw new Error('Could not read CardLadder’s display currency. Open Account → Display Settings and retry.');
  return [...root.querySelectorAll('a.list-item')].filter(element => element.querySelector('.sales-list-item-info')).map(element => {
    const soldDate = parseSaleDate(statValue(element, 'Date Sold'));
    const price = parseCardLadderMoney(statValue(element, 'Price'), currency);
    const url = safeSaleUrl(element.getAttribute('href'));
    if (!price) throw new Error(`A sale price could not be read as ${currency}. Keep CardLadder’s display currency unchanged during capture and retry. No price was applied.`);
    if (!soldDate || !url) throw new Error('A sale has an unreadable date or link. No price will be applied for this card.');
    return { soldDate, price, url, currency, title: textOf(element.querySelector('.item-text')),
      type: statValue(element, 'Type'), platform: textOf(element.querySelector('.platform-text')),
      verified: Boolean(element.querySelector('.verified-icon')) };
  });
}

export function resultCount(root) {
  const match = /\b([\d,]+)\s+results\b/i.exec(textOf(root));
  return match ? Number(match[1].replace(/,/g, '')) : null;
}
