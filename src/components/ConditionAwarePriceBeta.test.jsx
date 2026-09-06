import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConditionAwarePriceBeta } from './ConditionAwarePriceBeta';
import { apiFetchConditionAwarePriceBeta } from '@/utils/apiHelpers';

vi.mock('@/utils/apiHelpers', () => ({
  apiFetchConditionAwarePriceBeta: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots = [];

async function renderBeta(card) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(<ConditionAwarePriceBeta card={card} currency="USD" />);
  });
  return container;
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(async () => {
  apiFetchConditionAwarePriceBeta.mockReset();
  while (mountedRoots.length) {
    const { root, container } = mountedRoots.pop();
    await act(async () => root.unmount());
    container.remove();
  }
});

describe('ConditionAwarePriceBeta', () => {
  it('shows an exact condition-specific price and SKU without changing seller ask', async () => {
    apiFetchConditionAwarePriceBeta.mockResolvedValue({
      status: 'exact',
      identity: { name: 'Charizard GX (Secret)' },
      condition: { code: 'HP', label: 'Heavily Played' },
      selectedPrinting: 'Holofoil',
      printingOptions: [{ value: 'Holofoil', label: 'Holofoil' }],
      price: {
        amount: 197.25,
        currency: 'USD',
        confidence: 'high',
        source: 'JustTCG / TCGplayer',
        tcgplayerSkuId: '3442762',
      },
    });

    const container = await renderBeta({
      name: 'Charizard GX',
      set: 'Burning Shadows',
      number: '150',
      condition: 'HP',
      tcgplayerId: '138497',
      language: 'English',
    });
    await click(container.querySelector('button'));

    expect(container.textContent).toContain('Exact condition price');
    expect(container.textContent).toContain('$197.25');
    expect(container.textContent).toContain('3442762');
    expect(container.textContent).toContain('does not change Seller Ask');
  });

  it('requires a printing selection rather than guessing between normal and reverse holo', async () => {
    apiFetchConditionAwarePriceBeta.mockResolvedValue({
      status: 'printing-confirmation-required',
      identity: { name: 'Blastoise (37)' },
      condition: { code: 'LP', label: 'Lightly Played' },
      selectedPrinting: null,
      printingOptions: [
        { value: 'Normal', label: 'Normal', targetConditionPrice: 51.6 },
        { value: 'Reverse Holofoil', label: 'Reverse Holofoil', targetConditionPrice: 161.81 },
      ],
      price: null,
    });

    const container = await renderBeta({
      name: 'Blastoise',
      set: 'Expedition',
      number: '37',
      condition: 'LP',
      tcgplayerId: '83890',
      language: 'English',
    });
    await click(container.querySelector('button'));

    expect(container.textContent).toContain('Confirm the printing');
    expect(container.textContent).toContain('Rafchu will not guess');
    expect(container.textContent).toContain('Reverse Holofoil');
  });

  it('does not render for Japanese cards', async () => {
    const container = await renderBeta({ name: 'リザードン', language: 'Japanese' });
    expect(container.innerHTML).toBe('');
  });

  it('does not render for graded cards even when the legacy isGraded flag is missing', async () => {
    const container = await renderBeta({
      name: 'Charizard GX',
      language: 'English',
      gradingCompany: 'PSA',
      grade: '8',
    });
    expect(container.innerHTML).toBe('');
  });
});
