// Parse grading service + numeric grade from an eBay listing title.
// Matches strings like "PSA 10", "PSA10", "BGS 9.5", "CGC 10 PRISTINE", "SGC 9".

export type GradingService = 'PSA' | 'BGS' | 'CGC' | 'SGC';
export type ParsedGrade = { service: GradingService; grade: string; label: string };

const PATTERNS: Array<{ re: RegExp; service: GradingService }> = [
  { re: /\b(PSA)\s?(10|9(?:\.5)?|8(?:\.5)?|7|6|5|4|3|2|1)\b/i, service: 'PSA' },
  { re: /\b(BGS|BECKETT)\s?(10(?:\.0)?|9\.5|9|8\.5|8|7\.5|7)\b/i, service: 'BGS' },
  { re: /\b(CGC)\s?(10(?:\.0)?|9\.5|9|8\.5|8|7\.5|7)\b/i, service: 'CGC' },
  { re: /\b(SGC)\s?(10(?:\.0)?|9\.5|9|8\.5|8|7\.5|7)\b/i, service: 'SGC' },
];

export function parseGrade(title: string): ParsedGrade | null {
  for (const { re, service } of PATTERNS) {
    const m = title.match(re);
    if (m) {
      const grade = m[2] ?? '';
      const label = normalizeLabel(service, grade);
      return { service, grade, label };
    }
  }
  return null;
}

function normalizeLabel(service: GradingService, grade: string): string {
  const clean = grade.replace('.', '');
  return `${service}${clean}`; // e.g. "PSA10", "BGS95"
}

export function isLikelyRaw(title: string): boolean {
  return parseGrade(title) === null && !/slab|graded/i.test(title);
}
