import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardmarketPhoto } from './CardmarketPhoto';

let host, root;
const source = 'https://marketplace-article-scans.s3.cardmarket.com/1001/1001.jpg';
const product = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Card#articleRow1001';
const photo = 'data:image/jpeg;base64,aGVsbG8=';
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it('uses the local preview and enlarges it without leaving Rafchu', () => {
  act(() => root.render(<CardmarketPhoto src={source} cachedSrc={photo} name="Blastoise offered by Seller" productUrl={product} seller />));
  expect(host.querySelector('img').getAttribute('src')).toBe(photo);
  const dialog = document.querySelector('dialog'); dialog.showModal = vi.fn();
  act(() => host.querySelector('button').click());
  expect(dialog.showModal).toHaveBeenCalledOnce();
  expect(dialog.querySelector('img').getAttribute('src')).toBe(photo);
  expect(dialog.querySelector('a').href).toBe(product);
});

it('keeps the exact listing link if the remote photo fails, and retries when a cached image arrives', () => {
  const props = { src: source, name: 'Card', productUrl: product, seller: true };
  act(() => root.render(<CardmarketPhoto {...props} />));
  act(() => host.querySelector('img').dispatchEvent(new Event('error')));
  expect(host.querySelector('a').href).toBe(product);
  expect(host.textContent).toContain('Open seller listing');
  act(() => root.render(<CardmarketPhoto {...props} cachedSrc={photo} />));
  expect(host.querySelector('img').getAttribute('src')).toBe(photo);
  expect(host.querySelector('button')).not.toBeNull();
});
