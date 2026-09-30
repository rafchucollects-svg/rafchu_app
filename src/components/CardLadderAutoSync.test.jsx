import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn(), success: vi.fn(), info: vi.fn(), db: {} }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ user: { uid: 'test' }, db: mocks.db }) }));
vi.mock('@/utils/cardLadderCompanion', () => ({ autoSyncKey: uid => `auto:${uid}`, companionRequest: mocks.request, saveCardLadderReport: mocks.save }));
vi.mock('@/components/ui/Toaster', () => ({ toast: { success: mocks.success, info: mocks.info } }));
import { CardLadderAutoSync } from './CardLadderAutoSync';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.clearAllMocks();
  localStorage.clear(); localStorage.setItem('auto:test', 'true');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mocks.request.mockImplementation(async action => action === 'status'
    ? { runId: 'one', status: { state: 'complete' } } : { runId: 'one' });
  mocks.save.mockResolvedValue({ removedCount: 1, updatedCount: 0 });
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.useRealTimers(); localStorage.clear();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('reconciles a completed capture once and explains how to recover a removed card', async () => {
  await act(async () => root.render(<CardLadderAutoSync />));
  expect(mocks.save).toHaveBeenCalledWith(mocks.db, 'test', { runId: 'one' }, {}, {}, null, true);
  expect(mocks.info).toHaveBeenCalledWith('CardLadder removed 1 card no longer in its Inventory. You can restore it in Recently deleted.');
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it.each(['running', 'error'])('does not apply a retained report while the latest capture is %s', async state => {
  mocks.request.mockResolvedValue({ runId: 'old', status: { state } });
  await act(async () => root.render(<CardLadderAutoSync />));
  expect(mocks.request).not.toHaveBeenCalledWith('report');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('leaves inventory unchanged when manual review takes over while reading the report', async () => {
  mocks.request.mockImplementation(async action => {
    if (action === 'status') return { runId: 'one', status: { state: 'complete' } };
    localStorage.setItem('auto:test', 'false');
    return { runId: 'one' };
  });
  await act(async () => root.render(<CardLadderAutoSync />));
  expect(mocks.save).not.toHaveBeenCalled();
});

it('does not apply a different report that replaces the advertised capture mid-read', async () => {
  mocks.request.mockImplementation(async action => action === 'status'
    ? { runId: 'one', status: { state: 'complete' } } : { runId: 'two' });
  await act(async () => root.render(<CardLadderAutoSync />));
  expect(mocks.save).not.toHaveBeenCalled();
});
