import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GradedCardModal } from './GradedCardModal';
import { GradingBadge } from './GradingCompanyLogo';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const change = async (select, value) => act(async () => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});

it.each([
  ['BGS', '10'], ['BGS', '10 Black Label'], ['BGS', '8.5'],
  ['CGC', '10'], ['CGC', '10 Pristine'], ['CGC', '10 Perfect'], ['CGC', '6.5'],
])('adds %s %s with the exact selected grade', async (company, grade) => {
  const submit = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(<GradedCardModal isOpen card={{ name: 'Lugia V', set: 'Silver Tempest', number: '186' }} onClose={() => {}} onSubmit={submit} />));
  await change(host.querySelectorAll('select')[0], company);
  const gradeSelect = host.querySelectorAll('select')[1];
  expect([...gradeSelect.options].map(option => option.value)).toContain(grade);
  await change(gradeSelect, grade);
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Add to Collection').click());
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ gradingCompany: company, grade, isGraded: true }));
});

it('resets an incompatible label tier when the grading company changes', async () => {
  await act(async () => root.render(<GradedCardModal isOpen card={{ name: 'Lugia V' }} onClose={() => {}} onSubmit={() => {}} />));
  const [company, grade] = host.querySelectorAll('select');
  await change(company, 'CGC');
  await change(grade, '10 Perfect');
  await change(company, 'BGS');
  expect(grade.value).toBe('10');
  expect([...grade.options].map(option => option.value)).not.toContain('10 Perfect');
  expect(grade.selectedOptions[0].textContent).toContain('Pristine (Gold Label)');
});

it('shows the full BGS and CGC grade tier in badges', () => {
  for (const [company, grade, label] of [['BGS', '10', '10 Pristine (Gold Label)'], ['BGS', '10 Black Label', '10 Black Label'], ['CGC', '10', '10 Gem Mint'], ['CGC', 'Pristine10', '10 Pristine'], ['CGC', '10 Perfect', '10 Perfect (legacy)']]) {
    const markup = renderToStaticMarkup(<GradingBadge company={company} grade={grade} />);
    expect(markup).toContain(`title="${company} ${label}"`);
    expect(markup).toContain(`>${label}</span>`);
  }
});
