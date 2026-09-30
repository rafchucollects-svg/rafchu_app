import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ currency: 'USD', userProfile: {} }) }));
vi.mock('@/utils/apiHelpers', () => ({
  apiFetchGradedPrices: vi.fn(async () => ({ success: false })),
  apiFetchMarketPrices: vi.fn(async () => null),
  apiSearchCardsHybrid: vi.fn(async () => []),
  getEmbeddedGradedPrices: () => ({ '9': { price: 50 } }),
}));
vi.mock('@/utils/cardHelpers', () => ({ convertCurrency: value => value, formatCurrency: value => `$${value}` }));
import { AddCardModal } from './AddCardModal';
import { ManualCardEntry } from './ManualCardEntry';

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

it.each([['BGS', '10 Black Label'], ['CGC', '10 Pristine'], ['CGC', '10 Perfect'], ['CGC', '7.5']])('retains %s %s in the detailed add form even without provider pricing', async (company, grade) => {
  const onAdd = vi.fn();
  await act(async () => root.render(<AddCardModal isOpen card={{ name: 'Lugia V', set: 'Silver Tempest' }} onClose={() => {}} onAdd={onAdd} />));
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  const companySelect = [...host.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'BGS'));
  await change(companySelect, company);
  const gradeSelect = [...host.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === '9.5'));
  expect([...gradeSelect.options].map(option => option.value)).toContain(grade);
  await change(gradeSelect, grade);
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ gradingCompany: company, grade, gradedPrice: null }));
});

it.each([['BGS', '10 Black Label'], ['CGC', '10 Pristine'], ['CGC', '10 Perfect'], ['BGS', '9.5']])('retains %s %s in manual entry', async (company, grade) => {
  const onAdd = vi.fn();
  await act(async () => root.render(<ManualCardEntry initialQuery="Lugia V" onAddCard={onAdd} />));
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  const companySelect = [...host.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'BGS'));
  await change(companySelect, company);
  const gradeSelect = [...host.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === '9.5'));
  await change(gradeSelect, grade);
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent.includes('Add to Collection')).click());
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ gradingCompany: company, grade }), expect.anything());
});
