const NUMERIC_GRADES = Array.from({ length: 19 }, (_, index) => String(10 - index / 2));

const COMPANY_ALIASES = {
  psa: 'PSA', bgs: 'BGS', beckett: 'BGS', 'bgs beckett': 'BGS',
  'beckett grading services': 'BGS', cgc: 'CGC', 'cgc cards': 'CGC',
  'cgc trading cards': 'CGC', sgc: 'SGC', ace: 'ACE', other: 'Other',
};

const cleanText = value => String(value ?? '').trim().toLowerCase()
  .replace(/[()_-]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Keep the company, numeric grade and label tier as one identity. A BGS gold
 * Pristine 10 is the regular BGS 10; Black Label, CGC Pristine and legacy CGC
 * Perfect are separate grades and must never share sales or inventory matches.
 * Unrecognized or contradictory labels fail closed rather than losing a tier.
 */
export function normalizeGrading(company, grade) {
  const gradingCompany = COMPANY_ALIASES[cleanText(company)];
  if (!gradingCompany || grade === null || grade === undefined || grade === '') return null;
  if (/(?:^|\s)-\s*\d/.test(String(grade))) return null;
  let text = cleanText(grade).replace(/([a-z])(\d)|(\d)([a-z])/g, '$1$3 $2$4').trim();

  const companies = [...text.matchAll(/\b(psa|bgs|beckett|cgc|sgc|ace)\b/g)].map(match => COMPANY_ALIASES[match[1]]);
  if (companies.some(value => value !== gradingCompany)) return null;
  text = text.replace(/\b(psa|bgs|beckett|cgc|sgc|ace)\b/g, '').replace(/\s+/g, ' ').trim();

  const numbers = text.match(/\d+(?:\.\d+)?/g);
  if (numbers?.length !== 1) return null;
  const numericGrade = Number(numbers[0]);
  if (!Number.isFinite(numericGrade) || numericGrade < 1 || numericGrade > 10 || numericGrade * 2 % 1 !== 0) return null;
  const descriptor = text.replace(numbers[0], '').replace(/\s+/g, ' ').trim();
  const normalizedGrade = String(numericGrade);
  if (!descriptor || /^(?:gem mint|gem mt|mint|mt|near mint|near mint mint|nm mt|nm|excellent mint|ex mt|excellent|ex|very good excellent|vg ex|very good|vg|good|fair|poor)$/.test(descriptor)) {
    return { gradingCompany, grade: normalizedGrade };
  }

  if (numericGrade !== 10) return null;
  if (gradingCompany === 'BGS') {
    if (/^(?:pristine|p|gold label|gold label pristine|pristine gold label)$/.test(descriptor)) return { gradingCompany, grade: '10' };
    if (/^(?:(?:pristine )?(?:black label|blacklabel|black|bl|b)|(?:black label|blacklabel|black|bl|b) pristine)$/.test(descriptor)) return { gradingCompany, grade: '10 Black Label' };
  }
  if (gradingCompany === 'CGC' && (descriptor === 'pristine' || descriptor === 'perfect')) {
    return { gradingCompany, grade: descriptor === 'pristine' ? '10 Pristine' : '10 Perfect' };
  }
  return null;
}

export function sameGrading(a, b) {
  const left = normalizeGrading(a?.gradingCompany ?? a?.company, a?.grade);
  const right = normalizeGrading(b?.gradingCompany ?? b?.company, b?.grade);
  return Boolean(left && right && left.gradingCompany === right.gradingCompany && left.grade === right.grade);
}

export function getGradeOptions(company) {
  const normalizedCompany = COMPANY_ALIASES[cleanText(company)];
  const tiers = normalizedCompany === 'BGS' ? ['10 Black Label']
    : normalizedCompany === 'CGC' ? ['10 Pristine', '10 Perfect'] : [];
  return [...tiers, ...NUMERIC_GRADES];
}

export function getGradeLabel(company, grade) {
  const normalized = normalizeGrading(company, grade);
  if (!normalized) return String(grade ?? '');
  if (normalized.grade === '10' && normalized.gradingCompany === 'BGS') return '10 Pristine (Gold Label)';
  if (normalized.grade === '10' && normalized.gradingCompany === 'CGC') return '10 Gem Mint';
  if (normalized.grade === '10 Perfect') return '10 Perfect (legacy)';
  return normalized.grade;
}

/** Retain an ordinary grade when changing company, but clear incompatible tiers. */
export function gradeForCompany(company, grade, fallback = '') {
  return normalizeGrading(company, grade)?.grade ?? fallback;
}

/** Market evidence and provider links belong to the exact grade they describe. */
export function updateItemGrading(item, company, grade) {
  const grading = normalizeGrading(company, grade);
  if (!grading) throw new Error('Select a supported grading company and exact grade.');
  if (sameGrading(item, grading)) return { ...item, ...grading };
  const staleKeys = new Set(['holdingId', 'holdingIdentityKey', 'inventoryIdentityKey', 'inventoryAccountKey', 'linkedAt', 'membershipRestoredAt', 'ladderId',
    'slabSerial', 'fullCard', 'currentValue', 'totalValue', 'potentialProfit', 'population']);
  return {
    ...item, ...grading, gradedPrice: null, gradedPriceCurrency: null,
    calculatedSuggestedPrice: null, cardladderPricing: null,
    cardladderData: item.cardladderData
      ? Object.fromEntries(Object.entries(item.cardladderData).filter(([key]) => !staleKeys.has(key))) : null,
  };
}
