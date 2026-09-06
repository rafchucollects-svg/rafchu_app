import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardPrices } from './CardComponents';

describe('price provenance', () => {
  it('shows missing averages as unavailable rather than zero', () => {
    const html = renderToStaticMarkup(<CardPrices mode="collector" marketSource="cardmarket" currency="EUR" card={{ prices:{cardmarket:{avg30:20,currency:'EUR'}} }} />);
    expect(html).toContain('Unavailable');
    expect(html).not.toContain('€0.00');
    expect(html).toContain('Unknown');
    expect(html).toContain('not completed sales');
  });
});
