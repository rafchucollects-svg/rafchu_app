import { describe, expect, it } from 'vitest';
import { getGradeLabel, getGradeOptions, gradeForCompany, normalizeGrading, sameGrading, updateItemGrading } from './grading';

describe('grading identities', () => {
  it.each([
    ['BGS', 10, 'BGS', '10'], ['beckett', 'Pristine 10', 'BGS', '10'],
    ['BGS', 'BGS10 Gold Label', 'BGS', '10'], ['BGS', 'BLACK LABEL 10', 'BGS', '10 Black Label'],
    ['BGS', 'BGS 10 BL', 'BGS', '10 Black Label'], ['cgc', '10.0', 'CGC', '10'],
    ['BECKETT', '10 P', 'BGS', '10'], ['BECKETT', '10 B', 'BGS', '10 Black Label'],
    ['BGS', 'Pristine10 Black Label', 'BGS', '10 Black Label'],
    ['CGC', 'CGC Gem-Mint 10', 'CGC', '10'], ['CGC Cards', 'Pristine10', 'CGC', '10 Pristine'],
    ['CGC', '10 Perfect', 'CGC', '10 Perfect'], ['PSA', 'PSA 9 MINT', 'PSA', '9'],
  ])('normalizes %s %s without losing label identity', (company, grade, gradingCompany, expectedGrade) => {
    expect(normalizeGrading(company, grade)).toEqual({ gradingCompany, grade: expectedGrade });
  });

  it.each(['PSA', 'BGS', 'CGC', 'SGC', 'ACE', 'Other'])('retains all numeric %s grades', company => {
    for (let grade = 1; grade <= 10; grade += 0.5) {
      expect(normalizeGrading(company, grade)).toEqual({ gradingCompany: company, grade: String(grade) });
      expect(getGradeOptions(company)).toContain(String(grade));
    }
  });

  it.each([
    ['BGS', '10 Perfect'], ['CGC', '10 Black Label'], ['PSA', '10 Pristine'],
    ['CGC', '9.5 Pristine'], ['CGC', '10 Perfect Pristine'], ['CGC', '10 Gem Mint Pristine'],
    ['BGS', 'PSA 10'], ['BGS', '9.5/10'],
    ['CGC', '10 unknown'], ['CGC', '10+'], ['CGC', '11'], ['CGC', '0'], ['CGC', '8.7'],
    ['Unknown', '10'], ['CGC', null], ['CGC', ''], ['CGC', '-1'],
  ])('rejects conflicting or ambiguous %s %s', (company, grade) => {
    expect(normalizeGrading(company, grade)).toBeNull();
  });

  it('matches aliases while keeping every 10 tier distinct', () => {
    expect(sameGrading({ gradingCompany: 'BGS', grade: 'Pristine10' }, { gradingCompany: 'BGS', grade: '10' })).toBe(true);
    const identities = [
      { gradingCompany: 'BGS', grade: '10' }, { gradingCompany: 'BGS', grade: '10 Black Label' },
      { gradingCompany: 'CGC', grade: '10' }, { gradingCompany: 'CGC', grade: '10 Pristine' },
      { gradingCompany: 'CGC', grade: '10 Perfect' },
    ];
    for (const [index, left] of identities.entries()) {
      for (const [otherIndex, right] of identities.entries()) expect(sameGrading(left, right)).toBe(index === otherIndex);
    }
    expect(sameGrading({ grade: '10' }, { grade: '10' })).toBe(false);
  });

  it('shows company-specific tiers and clears incompatible selections', () => {
    expect(getGradeOptions('BGS')).toContain('10 Black Label');
    expect(getGradeOptions('BGS')).not.toContain('10 Pristine');
    expect(getGradeOptions('CGC')).toEqual(expect.arrayContaining(['10', '10 Pristine', '10 Perfect', '9.5', '1.5']));
    expect(getGradeOptions('PSA')).not.toContain('10 Black Label');
    expect(gradeForCompany('CGC', '10 Black Label')).toBe('');
    expect(gradeForCompany('PSA', '10 Pristine', '10')).toBe('10');
    expect(getGradeLabel('BGS', '10')).toBe('10 Pristine (Gold Label)');
    expect(getGradeLabel('CGC', '10')).toBe('10 Gem Mint');
  });

  it('clears old-grade market evidence and links while preserving user prices and costs', () => {
    const item = { gradingCompany: 'CGC', grade: '10', gradedPrice: 100, gradedPriceCurrency: 'EUR',
      calculatedSuggestedPrice: 100, cardladderPricing: { highSale: { price: 100 } },
      overridePrice: 120, overridePriceCurrency: 'EUR', buyPrice: 80,
      cardladderData: { holdingId: 'old', holdingIdentityKey: 'old-key', inventoryAccountKey: 'previous-account', linkedAt: 123, membershipRestoredAt: 456,
        ladderId: 'old-profile', currentValue: 100, investment: 80, variation: 'Holo' } };
    expect(updateItemGrading(item, 'CGC', '10 Pristine')).toMatchObject({
      gradingCompany: 'CGC', grade: '10 Pristine', gradedPrice: null, gradedPriceCurrency: null,
      calculatedSuggestedPrice: null, cardladderPricing: null,
      overridePrice: 120, overridePriceCurrency: 'EUR', buyPrice: 80,
      cardladderData: { investment: 80, variation: 'Holo' },
    });
    expect(updateItemGrading(item, 'CGC', '10 Pristine').cardladderData).not.toHaveProperty('holdingId');
    expect(updateItemGrading(item, 'CGC', '10 Pristine').cardladderData).toEqual({ investment: 80, variation: 'Holo' });
    expect(updateItemGrading(item, 'CGC', 'Gem Mint10')).toEqual(item);
    expect(item.cardladderData.holdingId).toBe('old');
  });
});
