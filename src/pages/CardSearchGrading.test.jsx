import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ app: {} }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('@/utils/apiHelpers', () => ({
  apiFetchGradedPrices: vi.fn(async () => ({ success: false, error: 'No verified market data' })),
  apiFetchMarketPrices: vi.fn(), apiSearchCardsCached: vi.fn(), apiFetchCardDetails: vi.fn(),
  enrichCardWithMarketPrices: vi.fn(), formatSearchResults: vi.fn(),
  canonicalizeQuery: value => value, getSearchCacheEntry: vi.fn(),
  DEFAULT_SUGGESTION_LIMIT: 5, MAX_SUGGESTION_LIMIT: 50,
}));
vi.mock('@/utils/cardHelpers', () => ({ convertCurrency: value => value, formatCurrency: value => `$${value}` }));
vi.mock('@/components/CardComponents', () => ({ SuggestionItem: () => null, ConditionSelect: () => null, CardPrices: () => null, ExternalLinks: () => null }));
vi.mock('@/components/AddCardModal', () => ({ AddCardModal: () => null }));
vi.mock('@/components/ImageUploadModal', () => ({ ImageUploadModal: () => null }));
vi.mock('@/components/ManualCardEntry', () => ({ ManualCardModal: () => null }));
import { CardSearch } from './CardSearch';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('cardSearch_isGradedFilter_vendor', 'true');
  mocks.app = {
    user: { uid: 'test' }, query: '', suggestions: [], showAllSuggestions: false, loading: false, error: '',
    activeCard: { id: 'lugia', name: 'Lugia V', set: 'Silver Tempest', number: '186' },
    defaultCondition: 'NM', currency: 'USD', buyItems: [], userProfile: {},
    setQuery: vi.fn(), setSuggestions: vi.fn(), setShowAllSuggestions: vi.fn(), setLoading: vi.fn(), setError: vi.fn(),
    setActiveCard: vi.fn(), setDefaultCondition: vi.fn(), addToWishlist: vi.fn(), setTradeItems: vi.fn(),
    addToCollection: vi.fn(async () => ({})), setBuyItems: vi.fn(), triggerQuickAddFeedback: vi.fn(), getImageForCard: vi.fn(),
  };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); localStorage.clear();
});
async function change(select, value) {
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}

it.each([['BGS', '9.5'], ['BGS', '10 Black Label'], ['CGC', '8.5'], ['CGC', '10'], ['CGC', '10 Pristine'], ['CGC', '10 Perfect']])('adds unpriced %s %s to inventory and deal as a graded card', async (company, grade) => {
  await act(async () => root.render(<MemoryRouter><CardSearch mode="vendor" /></MemoryRouter>));
  const [companySelect, gradeSelect] = host.querySelectorAll('select');
  await change(companySelect, company);
  await change(gradeSelect, grade);
  expect(host.textContent).toContain(`No graded price available for ${company} ${grade}`);
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent.includes('Add to Inventory')).click());
  expect(mocks.app.addToCollection).toHaveBeenCalledWith(mocks.app.activeCard,
    expect.objectContaining({ isGraded: true, gradingCompany: company, grade, gradedPrice: null }));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent.includes('Add to Deal')).click());
  expect(mocks.app.setBuyItems).toHaveBeenCalledTimes(1);
  expect(mocks.app.setBuyItems.mock.calls[0][0]([])).toEqual([
    expect.objectContaining({ isGraded: true, gradingCompany: company, grade, gradedPrice: null }),
  ]);
});
