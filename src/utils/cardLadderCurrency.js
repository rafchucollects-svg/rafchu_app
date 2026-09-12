// Currency is read from CardLadder's rendered account preference. Symbols such
// as $ and ¥ are never sufficient evidence of the currency by themselves.
export const CARD_LADDER_CURRENCIES = {
  USD: { label: 'United States Dollar ($)', tokens: ['USD', 'US$', '$'] },
  CAD: { label: 'Canadian Dollar ($)', tokens: ['CAD', 'CA$', 'C$', '$'] },
  GBP: { label: 'British Pound (£)', tokens: ['GBP', '£'] },
  AUD: { label: 'Australian Dollar ($)', tokens: ['AUD', 'AU$', 'A$', '$'] },
  EUR: { label: 'Euro (€)', tokens: ['EUR', '€'] },
  CNY: { label: 'Chinese Yuan (¥)', tokens: ['CNY', 'CN¥', '¥', '￥'] },
  JPY: { label: 'Japanese Yen (¥)', tokens: ['JPY', 'JP¥', '¥', '￥'] },
  SGD: { label: 'Singapore Dollar ($)', tokens: ['SGD', 'SG$', 'S$', '$'] },
  PHP: { label: 'Philippine Peso (₱)', tokens: ['PHP', '₱'] },
  MXN: { label: 'Mexican Peso ($)', tokens: ['MXN', 'MX$', '$'] },
  NZD: { label: 'New Zealand Dollar ($)', tokens: ['NZD', 'NZ$', '$'] },
  HKD: { label: 'Hong Kong Dollar ($)', tokens: ['HKD', 'HK$', '$'] },
  NOK: { label: 'Norwegian Krone (kr)', tokens: ['NOK', 'kr'] },
};

export const isCardLadderCurrency = code => Object.hasOwn(CARD_LADDER_CURRENCIES, code);
export const currencyFromAccountLabel = label => Object.entries(CARD_LADDER_CURRENCIES)
  .find(([, entry]) => entry.label === String(label).trim())?.[0] || null;

export function parseCardLadderMoney(value, currency) {
  if (!isCardLadderCurrency(currency)) return null;
  const text = String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').trim();
  const token = CARD_LADDER_CURRENCIES[currency].tokens.find(candidate => text.startsWith(candidate) || text.endsWith(candidate));
  if (!token) return null;
  let number = (text.startsWith(token) ? text.slice(token.length) : text.slice(0, -token.length)).trim();
  if (!/^[\d., ']+$/.test(number)) return null;
  const decimal = /([.,])(\d{1,2})$/.exec(number);
  const fraction = decimal ? decimal[2] : '';
  if (decimal) number = number.slice(0, decimal.index);
  // Group separators must be consistent; malformed or abbreviated amounts fail.
  if (!/^\d+$/.test(number) && !/^\d{1,3}([., '])\d{3}(?:\1\d{3})*$/.test(number)) return null;
  if (decimal && number.includes(decimal[1])) return null;
  const amount = Number(number.replace(/[., ']/g, '') + (fraction ? `.${fraction}` : ''));
  return Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER / 100 ? amount : null;
}

export function formatCardLadderMoney(value, currency) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 2 }).format(value);
}
