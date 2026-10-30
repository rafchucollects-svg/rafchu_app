import { describe, it, expect } from 'vitest';
import { applyOperation, createWorkspace, seedDemoWorkspace, parseMoney, formatMoney, getDealBalance, validateWorkspace } from './domain.js';

const now = '2026-10-31T08:00:00.000Z';
const day = '2026-10-31';
const lot = (id, quantity = 1, extra = {}) => ({ id, name: id, set: 'Fixture', number: '1', language: 'Japanese', condition: 'NM', grade: 'PSA 9', quantity, askMinor: 3000, basisMinor: null, ownership: 'owned', ...extra });
const op = (id, kind, payload) => ({ id, kind, createdAt: now, payload });
const apply = (state, id, kind, payload) => applyOperation(state, op(id, kind, payload)).state;
const opening = (quantity = 3) => apply(createWorkspace(), 'open', 'opening', { lots: [lot('a', quantity)] });
const sale = (extra = {}) => ({ dealId: 'sale', kind: 'sale', outgoing: [{ lotId: 'a', quantity: 1 }], incoming: [], agreedMinor: 2500, direction: 'receive', paymentMinor: 1000, method: 'cash', occurredOn: day, counterparty: '', note: '', ...extra });
function freeze(value) { Object.freeze(value); Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); }); return value; }

describe('exact money and input admission', () => {
  it('parses cents without floating point rounding and formats signed balances', () => {
    expect(parseMoney(' 0,01 ')).toBe(1);
    expect(parseMoney('19.9')).toBe(1990);
    expect(parseMoney('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatMoney(1001)).toBe('€10.01');
    expect(formatMoney(-1)).toBe('−€0.01');
    for (const invalid of ['', '-1', '+1', '1.001', '1e2', 'NaN', '€12', '1,000.00', '90071992547409.92']) expect(() => parseMoney(invalid)).toThrow();
  });

  it('requires owned quantities, exact cents, genuine dates and EUR without mutating input', () => {
    const state = freeze(opening());
    for (const payload of [sale({ agreedMinor: 2.5 }), sale({ currency: 'USD' }), sale({ occurredOn: '2026-02-30' }), sale({ outgoing: [{ lotId: 'a', quantity: 0 }] }), sale({ outgoing: [{ lotId: 'missing', quantity: 1 }] })]) {
      expect(() => apply(state, 'bad', 'deal', payload)).toThrow();
      expect(state.lots.a.quantity).toBe(3); expect(state.operations.bad).toBeUndefined();
    }
    expect(() => apply(createWorkspace(), 'bad', 'opening', { lots: [lot('a', 1, { ownership: 'consigned' })] })).toThrow(/owned/);
    expect(() => apply(createWorkspace(), 'bad', 'opening', { lots: [lot('a', NaN)] })).toThrow();
    expect(() => apply(state, 'bad', 'deal', sale({ occurredOn: '2026-10-31T01:00:00Z' }))).toThrow();
  });

  it('keeps unknown acquisition basis independent of asking price', () => {
    let state = opening();
    state = apply(state, 'ask', 'ask', { lotId: 'a', askMinor: 9999 });
    state = apply(state, 'sell', 'deal', sale());
    expect(state.deals.sale.outgoing[0]).toMatchObject({ name: 'a', language: 'Japanese', grade: 'PSA 9', basisMinor: null, askMinor: 9999, quantity: 1 });
    expect(state.deals.sale.agreedMinor).toBe(2500);
    expect(state.lots.a.basisMinor).toBeNull();
  });
});

describe('durable intents and lost acknowledgements', () => {
  it('recovers the exact historical receipt after other activity without replaying stock or money', () => {
    const request = op('sale-op', 'deal', sale());
    const accepted = applyOperation(freeze(opening()), request);
    let state = apply(accepted.state, 'later', 'payment', { dealId: 'sale', amountMinor: 1500, direction: 'receive', method: 'bank', occurredOn: '2026-11-01' });
    state = apply(state, 'next-sale', 'deal', sale({ dealId: 'second', paymentMinor: 0 }));
    const recovered = applyOperation(state, { ...request, payload: Object.fromEntries(Object.entries(request.payload).reverse()) });
    expect(recovered.receipt).toEqual(accepted.receipt);
    expect(recovered.state).toBe(state);
    expect(recovered.state.lots.a.quantity).toBe(1);
    expect(recovered.state.deals.sale.payments).toHaveLength(2);
    expect(recovered.receipt.revision).toBe(2);
    expect(recovered.state.revision).toBe(4);
  });

  it('rejects same operation ID with changed terms or timestamp', () => {
    const request = op('sale-op', 'deal', sale());
    const { state } = applyOperation(opening(), request);
    expect(() => applyOperation(state, { ...request, payload: sale({ agreedMinor: 2600 }) })).toThrow(/different input/);
    expect(() => applyOperation(state, { ...request, createdAt: '2026-10-31T08:01:00.000Z' })).toThrow(/different input/);
    expect(state.lots.a.quantity).toBe(2);
  });

  it('lets only one stale client consume the final unit', () => {
    const stale = opening(1);
    const first = apply(stale, 'first', 'deal', sale());
    expect(() => apply(first, 'second', 'deal', sale({ dealId: 'other' }))).toThrow(/Not enough/);
    expect(first.lots.a.quantity).toBe(0);
    expect(Object.keys(first.deals)).toEqual(['sale']);
  });

  it('rejects duplicated outgoing lines before any stock is consumed', () => {
    const state = opening();
    expect(() => apply(state, 'bad', 'deal', sale({ outgoing: [{ lotId: 'a', quantity: 1 }, { lotId: 'a', quantity: 1 }] }))).toThrow(/repeated/);
    expect(state.lots.a.quantity).toBe(3);
  });

  it('consumes a whole saved draft once, retains it and rejects partial/stale completion', () => {
    const state = opening();
    state.drafts.draft = { id: 'draft', revision: 1, status: 'open', payload: sale() };
    const withDraft = sale({ draftId: 'draft', draftRevision: 1 });
    expect(() => apply(state, 'bad', 'deal', { ...withDraft, draftRevision: 0 })).toThrow(/changed/);
    expect(() => apply(state, 'bad', 'deal', { ...withDraft, agreedMinor: 1000 })).toThrow(/whole saved deal/);
    const result = apply(state, 'accepted', 'deal', withDraft);
    expect(result.drafts.draft).toMatchObject({ status: 'completed', completedBy: 'accepted', completedDealId: 'sale', payload: sale() });
    expect(() => apply(result, 'another', 'deal', { ...withDraft, dealId: 'another' })).toThrow(/already completed/);
    expect(state.drafts.draft.status).toBe('open');
  });

  it('rejects malformed saved drafts while retaining incomplete or stale valid draft structure', () => {
    const state = opening();
    state.drafts.draft = { id: 'draft', revision: 1, status: 'open', payload: sale({
      outgoing: [{ lotId: 'unavailable', quantity: 0 }], incoming: [], occurredOn: '',
    }) };
    expect(validateWorkspace(state)).toBe(true);
    const invalidEdits = [
      draft => { delete draft.status; }, draft => { draft.status = 'deleted'; },
      draft => { delete draft.payload; }, draft => { draft.payload = []; },
      draft => { delete draft.payload.kind; }, draft => { draft.payload.incoming = {}; },
      draft => { draft.payload.outgoing = null; }, draft => { draft.payload.agreedMinor = '25'; },
      draft => { draft.payload.counterparty = {}; }, draft => { draft.payload.outgoing[0].quantity = -1; },
      draft => { draft.payload.incoming = [lot('incoming', 1, { name: {} })]; },
      draft => { draft.payload.incoming = [lot('incoming', 1, { set: null })]; },
    ];
    for (const edit of invalidEdits) {
      const malformed = JSON.parse(JSON.stringify(state)); edit(malformed.drafts.draft);
      expect(() => validateWorkspace(malformed)).toThrow();
    }
    state.drafts.draft.payload = sale({ kind: 'buy', outgoing: [], incoming: [lot('new', 0, { name: '' })], direction: 'pay' });
    expect(validateWorkspace(state)).toBe(true);
    expect(() => apply(state, 'bad', 'deal', { ...state.drafts.draft.payload, draftId: 'draft', draftRevision: 1 })).toThrow();
  });
});

describe('agreement, actual money and physical stock remain distinct', () => {
  it('preserves partial receipt, later payment, credit and actual refund as separate facts', () => {
    let state = apply(opening(), 'sale', 'deal', sale());
    expect(getDealBalance(state.deals.sale).outstandingMinor).toBe(1500);
    state = apply(state, 'paid-later', 'payment', { dealId: 'sale', amountMinor: 1500, direction: 'receive', method: 'bank', occurredOn: '2026-11-01' });
    state = apply(state, 'credit', 'credit', { dealId: 'sale', amountMinor: 500, reason: 'Agreed partial credit, no physical return' });
    expect(getDealBalance(state.deals.sale).outstandingMinor).toBe(-500);
    state = apply(state, 'refund', 'payment', { dealId: 'sale', amountMinor: 500, direction: 'pay', method: 'bank', occurredOn: '2026-11-01', note: 'Refund' });
    expect(getDealBalance(state.deals.sale)).toEqual({ agreedMinor: 2500, creditMinor: 500, receivedMinor: 2500, paidMinor: 500, outstandingMinor: 0, direction: 'receive' });
    expect(state.lots.a.quantity).toBe(2);
    expect(state.deals.sale.payments.map(item => item.occurredOn)).toEqual([day, '2026-11-01', '2026-11-01']);
  });

  it('keeps excess actual money rather than silently clipping it to an agreement', () => {
    let state = apply(opening(), 'sale', 'deal', sale({ paymentMinor: 0 }));
    state = apply(state, 'overpay', 'payment', { dealId: 'sale', amountMinor: 2501, direction: 'receive', method: 'cash', occurredOn: day });
    expect(getDealBalance(state.deals.sale)).toMatchObject({ receivedMinor: 2501, outstandingMinor: -1 });
    expect(() => apply(state, 'bad-credit', 'credit', { dealId: 'sale', amountMinor: 2501, reason: 'Too much' })).toThrow(/exceeds/);
  });

  it('receives bought stock before later supplier payment without invented unit basis', () => {
    let state = apply(createWorkspace(), 'buy', 'deal', { dealId: 'purchase', kind: 'buy', outgoing: [], incoming: [lot('b', 2)], agreedMinor: 6000, direction: 'pay', paymentMinor: 2000, method: 'cash', occurredOn: day });
    expect(state.lots.b).toMatchObject({ quantity: 2, basisMinor: null, lineage: { dealId: 'purchase' } });
    state = apply(state, 'supplier', 'payment', { dealId: 'purchase', amountMinor: 4000, direction: 'pay', method: 'bank', occurredOn: '2026-11-01' });
    expect(getDealBalance(state.deals.purchase)).toMatchObject({ paidMinor: 6000, outstandingMinor: 0 });
    expect(state.lots.b.quantity).toBe(2);
    state = apply(state, 'resale', 'deal', sale({ outgoing: [{ lotId: 'b', quantity: 1 }], agreedMinor: 4000, paymentMinor: 0 }));
    expect(state.lots.b.quantity).toBe(1);
    expect(state.deals.sale.outgoing[0].basisMinor).toBeNull();
  });

  it('trades quantities and later sells an acquired lot with stable lineage', () => {
    let state = apply(opening(), 'trade', 'deal', { dealId: 'trade-deal', kind: 'trade', outgoing: [{ lotId: 'a', quantity: 2 }], incoming: [lot('unused', 3)].map(({ id: _id, ...rest }) => rest), agreedMinor: 1000, direction: 'receive', paymentMinor: 500, method: 'cash', occurredOn: day });
    expect(state.lots.a.quantity).toBe(1);
    expect(state.lots['trade-in-0']).toMatchObject({ quantity: 3, basisMinor: null, lineage: { kind: 'trade', dealId: 'trade-deal' } });
    state = apply(state, 'resale', 'deal', sale({ outgoing: [{ lotId: 'trade-in-0', quantity: 1 }], paymentMinor: 0 }));
    expect(state.lots['trade-in-0'].quantity).toBe(2);
    expect(state.deals.sale.outgoing[0].lineage.dealId).toBe('trade-deal');
    expect(getDealBalance(state.deals['trade-deal']).outstandingMinor).toBe(500);
  });

  it('returns exact sold quantities into a new lot and does not invent a refund', () => {
    let state = apply(opening(), 'sale', 'deal', sale({ outgoing: [{ lotId: 'a', quantity: 2 }], agreedMinor: 5000, paymentMinor: 5000 }));
    state = apply(state, 'return', 'return', { dealId: 'sale', lines: [{ lotId: 'a', quantity: 1 }], creditMinor: 2500, reason: 'One card physically returned' });
    expect(state.lots.a.quantity).toBe(1);
    expect(state.lots['return-return-0']).toMatchObject({ quantity: 1, basisMinor: null, lineage: { kind: 'return', sourceLotId: 'a', dealId: 'sale' } });
    expect(getDealBalance(state.deals.sale)).toMatchObject({ creditMinor: 2500, paidMinor: 0, outstandingMinor: -2500 });
    expect(() => apply(state, 'excess', 'return', { dealId: 'sale', lines: [{ lotId: 'a', quantity: 2 }], reason: 'Too many' })).toThrow(/exceeds/);
    expect(() => apply(state, 'wrong', 'return', { dealId: 'sale', lines: [{ lotId: 'return-return-0', quantity: 1 }], reason: 'Wrong lineage' })).toThrow(/original sale/);
  });

  it('saves an owner note without evidence and later links an existing asset without financial effects', () => {
    const sold = apply(opening(), 'sale', 'deal', sale());
    let state = apply(sold, 'note', 'note', { text: 'Owner reports an agreement in a hypothetical Instagram DM.', dealId: 'sale', assetIds: [] });
    state.assets.image = { id: 'image', name: 'invented.png', type: 'image/png', size: 4, sha256: 'a'.repeat(64) };
    state = apply(state, 'attachment', 'note', { dealId: 'sale', text: 'Later supporting image', assetIds: ['image'] });
    expect(state.deals).toEqual(sold.deals); expect(state.lots).toEqual(sold.lots);
    expect(state.notes['note-note'].source).toBe('owner_report');
    expect(() => apply(state, 'missing', 'note', { text: 'Missing original', assetIds: ['absent'] })).toThrow(/missing/);
  });
});

describe('archive validation and supported schema', () => {
  it('validates a serialized workspace and exact receipt replay under a new imported workspace ID', () => {
    const request = op('sale-op', 'deal', sale());
    const accepted = applyOperation(opening(), request);
    const restored = JSON.parse(JSON.stringify(accepted.state));
    restored.id = 'imported-workspace'; restored.provenance = { sourceWorkspaceId: accepted.state.id };
    expect(validateWorkspace(restored)).toBe(true);
    const replay = applyOperation(restored, request);
    expect(replay.receipt).toEqual(accepted.receipt);
    expect(replay.receipt.workspaceId).toBe('weekend-test');
  });

  it('rejects live mode, incomplete money history, reserved keys and unknown source attachments', () => {
    const state = apply(opening(), 'sale', 'deal', sale());
    for (const edit of [s => { s.mode = 'live'; }, s => { delete s.deals.sale.payments; }, s => { s.lots.a.quantity = -1; }, s => { s.operations.sale.receipt.revision = 999; }]) {
      const bad = JSON.parse(JSON.stringify(state)); edit(bad); expect(() => validateWorkspace(bad)).toThrow();
    }
    expect(() => createWorkspace({ id: '__proto__' })).toThrow();
    const unsafe = JSON.parse(JSON.stringify(state).replace('"lots":{', '"lots":{"__proto__":{},'));
    expect(() => validateWorkspace(unsafe)).toThrow();
    expect(validateWorkspace(seedDemoWorkspace())).toBe(true);
  });

  it('rejects internally inconsistent imported quantities, receipts, lineage and money', () => {
    let state = apply(opening(), 'sale', 'deal', sale());
    state = apply(state, 'later', 'payment', { dealId: 'sale', amountMinor: 1500, direction: 'receive', method: 'bank', occurredOn: day });
    const corruptions = [
      s => { s.lots.a.quantity += 1; },
      s => { s.lots.a.askMinor = 1; },
      s => { s.lots.a.basisMinor = 0; },
      s => { s.deals.sale.agreedMinor = 2600; },
      s => { s.deals.sale.outgoing[0].quantity = 2; },
      s => { s.deals.sale.outgoing[0].language = 'English'; },
      s => { s.deals.sale.operationId = 'missing'; },
      s => { s.deals.sale.payments[1].amountMinor = 1600; },
      s => { s.deals.sale.payments.pop(); },
      s => { s.operations.later.receipt.dealId = 'missing'; },
      s => { s.operations.sale.receipt.lotIds = []; },
      s => { s.operations.sale.input = '{'; },
      s => { s.operations.sale.input = s.operations.sale.input.replace('"id":"sale"', '"id":"other"'); },
      s => { s.operations.sale.receipt.revision = s.operations.open.receipt.revision; },
    ];
    for (const edit of corruptions) {
      const malformed = JSON.parse(JSON.stringify(state)); edit(malformed);
      expect(() => validateWorkspace(malformed)).toThrow();
    }
    expect(validateWorkspace(state)).toBe(true);
  });

  it('does not let a restored completed draft lose its claim or silently reopen', () => {
    let state = opening();
    state.drafts.draft = { id: 'draft', revision: 1, status: 'open', payload: sale() };
    state = apply(state, 'sale', 'deal', sale({ draftId: 'draft', draftRevision: 1 }));
    const missing = JSON.parse(JSON.stringify(state)); delete missing.drafts.draft;
    expect(() => validateWorkspace(missing)).toThrow(/consumed draft/);
    const reopened = JSON.parse(JSON.stringify(state)); reopened.drafts.draft.status = 'open';
    expect(() => validateWorkspace(reopened)).toThrow(/status/);
  });
});
