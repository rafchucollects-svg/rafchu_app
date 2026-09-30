import { normalizeGrading } from '../../src/utils/grading.js';

// Verified from CardLadder's rendered profile selectors and their View All
// Sales destinations (2026-09-30). Matched profile IDs are NOT grader IDs.
export function salesGrading(holding) {
  const grading = normalizeGrading(holding?.gradingCompany, holding?.grade);
  if (!grading || !['PSA', 'BGS', 'CGC'].includes(grading.gradingCompany)) throw new Error('Unsupported grading company or grade. This holding was skipped.');
  const grader = grading.gradingCompany === 'BGS' ? 'beckett' : grading.gradingCompany.toLowerCase();
  let gradeKey = `g${grading.grade.replace('.', '_')}`;
  if (grading.gradingCompany === 'BGS' && grading.grade === '10') gradeKey = 'g10p';
  if (grading.grade === '10 Black Label') gradeKey = 'g10b';
  if (grading.grade === '10 Pristine') gradeKey = 'g10pristine';
  if (grading.grade === '10 Perfect') gradeKey = 'g10perfect';
  return { ...grading, grader, graderLabel: grader.toUpperCase(), gradeKey, filterLabel: gradeKey.slice(1).replace('_', '.') };
}

export function readSalesDestination(value, holding) {
  const expected = salesGrading(holding);
  let url;
  try { url = new URL(value); } catch { throw new Error('No exact linked sales destination.'); }
  if (url.origin !== 'https://app.cardladder.com' || url.pathname !== '/sales-history' || url.username || url.password) throw new Error('Unexpected sales destination.');
  const allowedParams = new Set(['filters', 'sort', 'direction', 'profileId', 'profileGrader', 'profileGrade']);
  if ([...url.searchParams.keys()].some(key => !allowedParams.has(key) || url.searchParams.getAll(key).length !== 1) ||
      (url.searchParams.has('profileGrader') && url.searchParams.get('profileGrader') !== expected.grader) ||
      (url.searchParams.has('profileGrade') && url.searchParams.get('profileGrade') !== expected.gradeKey)) throw new Error('Unexpected extra sales filters.');
  const parts = (url.searchParams.get('filters') || '').split('|');
  const filters = new Set(parts);
  const profileId = parts.find(part => part.startsWith('profileId:'))?.slice(10);
  if (parts.length !== 3 || filters.size !== 3 || !filters.has(`grader:${expected.grader}`) || !filters.has(`grade:${expected.gradeKey}`) ||
      !new RegExp(`^${expected.grader}-\\d+$`).test(profileId || '') || url.searchParams.get('sort') !== 'date' || url.searchParams.get('direction') !== 'desc') {
    throw new Error('Unexpected sales filters or sorting. The exact grader and grade could not be verified.');
  }
  return { ...expected, profileId, salesUrl: url.href };
}
