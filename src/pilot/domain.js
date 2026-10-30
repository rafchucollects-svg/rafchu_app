// Pure TEST-workspace commands. No network, credentials, clocks or storage writes.
const MAPS = ['lots', 'deals', 'operations', 'drafts', 'notes', 'assets'];
const KINDS = ['opening', 'ask', 'deal', 'payment', 'credit', 'return', 'note'];
const METHODS = ['cash', 'card', 'bank', 'other'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, label) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, `${label} must contain plain data.`);
  return value;
}

function identifier(value, label = 'ID') {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 240 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) && !FORBIDDEN_KEYS.has(value), `${label} is invalid.`);
  return value;
}

function text(value, label, required = false, max = 12000) {
  requireValue(typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0), `${label} is invalid.`);
  return value;
}

function integer(value, label, min = 0) {
  requireValue(Number.isSafeInteger(value) && value >= min, `${label} must be a safe whole number of ${label.includes('quantity') ? 'units' : 'cents'}.`);
  return value;
}

function sum(values, label = 'Money total') {
  return values.reduce((total, value) => {
    const next = total + value;
    requireValue(Number.isSafeInteger(next), `${label} exceeds the supported range.`);
    return next;
  }, 0);
}

function date(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter an event date as YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 'The event date does not exist.');
  return value;
}

function timestamp(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value), 'createdAt must be a UTC ISO timestamp.');
  date(value.slice(0, 10));
  requireValue(Number.isFinite(Date.parse(value)) && value.slice(11, 13) <= '23' && value.slice(14, 16) <= '59' && value.slice(17, 19) <= '59', 'createdAt is invalid.');
  return value;
}

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    requireValue(Number.isFinite(value), 'Data cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  object(value, 'Data');
  return `{${Object.keys(value).sort().map(key => {
    requireValue(!FORBIDDEN_KEYS.has(key), 'Reserved data key.');
    return `${JSON.stringify(key)}:${canonical(value[key])}`;
  }).join(',')}}`;
}

const copy = value => JSON.parse(canonical(value));
const has = (map, key) => Object.hasOwn(map, key);

function eur(payload) {
  requireValue(payload.currency == null || payload.currency === 'EUR', 'This test pilot supports EUR only.');
}

function direction(value) {
  requireValue(value === 'receive' || value === 'pay', 'Choose whether money is received or paid.');
  return value;
}

function paymentMethod(value) {
  requireValue(METHODS.includes(value), 'Choose cash, card, bank or other.');
  return value;
}

export function parseMoney(value) {
  requireValue(typeof value === 'string' && value.length <= 100, 'Enter money as decimal text.');
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  requireValue(match, 'Enter a non-negative amount with at most two decimal places.');
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  requireValue(cents <= BigInt(Number.MAX_SAFE_INTEGER), 'Money exceeds the supported range.');
  return Number(cents);
}

export function formatMoney(cents) {
  requireValue(Number.isSafeInteger(cents), 'Money must be safe integer cents.');
  const absolute = BigInt(cents < 0 ? -cents : cents);
  return `${cents < 0 ? '−' : ''}€${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function createWorkspace({ id = 'weekend-test', name = 'Weekend test workspace' } = {}) {
  identifier(id, 'Workspace ID');
  text(name, 'Workspace name', true, 200);
  return { schemaVersion: 1, id, name, mode: 'test', revision: 0, ...Object.fromEntries(MAPS.map(key => [key, {}])) };
}

const LOT_METADATA = ['excludedFromSale', 'identityDetails', 'sourceEntryId', 'ownershipBasis'];
const lotMetadata = lot => Object.fromEntries(LOT_METADATA.filter(key => has(lot, key)).map(key => [key, lot[key]]));

function validateLotMetadata(lot) {
  if (has(lot, 'excludedFromSale')) requireValue(typeof lot.excludedFromSale === 'boolean', 'Stock exclusion must be true or false.');
  if (has(lot, 'identityDetails')) text(lot.identityDetails, 'Additional card identity', false, 500);
  if (has(lot, 'sourceEntryId')) {
    text(lot.sourceEntryId, 'Source inventory entry ID', true, 500);
    requireValue(![...lot.sourceEntryId].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127), 'Source inventory entry ID contains control characters.');
  }
  if (has(lot, 'ownershipBasis')) requireValue(lot.ownershipBasis === 'live-app-classification', 'Unsupported ownership classification source.');
}

function validateLot(lot, expectedId) {
  object(lot, 'Lot');
  identifier(lot.id, 'Lot ID');
  requireValue(expectedId == null || lot.id === expectedId, 'Lot map ID does not match its record.');
  text(lot.name, 'Card name', true, 500);
  for (const field of ['set', 'number', 'language', 'condition', 'grade']) text(lot[field], `Card ${field}`, false, 500);
  integer(lot.quantity, 'Lot quantity');
  if (lot.askMinor !== null) integer(lot.askMinor, 'Asking price');
  requireValue(lot.basisMinor === null || Number.isSafeInteger(lot.basisMinor) && lot.basisMinor >= 0, 'Unit acquisition basis must be known cents or null.');
  requireValue(lot.ownership === 'owned', 'Only explicitly owned stock is supported.');
  requireValue(lot.currency === 'EUR', 'Lot currency must be EUR.');
  validateLotMetadata(lot);
}

function newLot(raw, id, lineage) {
  object(raw, 'Incoming lot');
  eur(raw);
  const lot = {
    id: identifier(id, 'Lot ID'), name: raw.name,
    set: raw.set ?? '', number: raw.number ?? '', language: raw.language ?? '',
    condition: raw.condition ?? '', grade: raw.grade ?? '',
    quantity: raw.quantity, askMinor: raw.askMinor,
    basisMinor: raw.basisMinor ?? null, ownership: raw.ownership,
    currency: 'EUR', lineage, ...lotMetadata(raw),
  };
  validateLot(lot);
  integer(lot.quantity, 'Incoming quantity', 1);
  return lot;
}

function validatePayment(payment) {
  object(payment, 'Payment');
  identifier(payment.id, 'Payment ID');
  integer(payment.amountMinor, 'Payment amount', 1);
  direction(payment.direction);
  paymentMethod(payment.method);
  date(payment.occurredOn);
  text(payment.note, 'Payment note');
}

function validateDraftPayload(payload) {
  object(payload, 'Draft payload');
  identifier(payload.dealId, 'Draft deal ID');
  requireValue(['sale', 'buy', 'trade'].includes(payload.kind), 'Draft deal kind is invalid.');
  eur(payload);
  requireValue(Array.isArray(payload.outgoing) && Array.isArray(payload.incoming), 'Draft stock lines must be lists.');
  for (const line of payload.outgoing) {
    object(line, 'Draft outgoing line'); identifier(line.lotId, 'Draft outgoing lot ID');
    integer(line.quantity, 'Draft outgoing quantity');
  }
  for (const line of payload.incoming) {
    object(line, 'Draft incoming line');
    if (has(line, 'id')) identifier(line.id, 'Draft incoming lot ID');
    eur(line);
    text(line.name, 'Draft card name', false, 500);
    for (const field of ['set', 'number', 'language', 'condition', 'grade']) {
      if (has(line, field)) text(line[field], `Draft card ${field}`, false, 500);
    }
    integer(line.quantity, 'Draft incoming quantity');
    if (line.askMinor !== null) integer(line.askMinor, 'Draft asking price');
    requireValue(line.basisMinor == null || Number.isSafeInteger(line.basisMinor) && line.basisMinor >= 0, 'Draft unit basis must be known cents or null.');
    requireValue(line.ownership === 'owned', 'Draft incoming stock must be explicitly owned.');
    validateLotMetadata(line);
  }
  integer(payload.agreedMinor, 'Draft agreement amount');
  integer(payload.paymentMinor ?? 0, 'Draft initial payment');
  direction(payload.direction);
  if (payload.method != null) paymentMethod(payload.method);
  text(payload.occurredOn, 'Draft event date');
  if (payload.occurredOn !== '') date(payload.occurredOn);
  if (payload.counterparty != null) text(payload.counterparty, 'Draft counterparty');
  if (payload.note != null) text(payload.note, 'Draft note');
  if (payload.draftId != null) identifier(payload.draftId, 'Draft reference');
  if (payload.draftRevision != null) integer(payload.draftRevision, 'Draft reference revision');
}

export function getDealBalance(deal) {
  integer(deal.agreedMinor, 'Agreement amount');
  direction(deal.direction);
  requireValue(Array.isArray(deal.payments) && Array.isArray(deal.credits), 'Deal money history is incomplete.');
  deal.payments.forEach(validatePayment);
  const creditMinor = sum(deal.credits.map(item => integer(item.amountMinor, 'Credit amount', 1)));
  requireValue(creditMinor <= deal.agreedMinor, 'Credits exceed the original agreement.');
  const receivedMinor = sum(deal.payments.filter(item => item.direction === 'receive').map(item => item.amountMinor));
  const paidMinor = sum(deal.payments.filter(item => item.direction === 'pay').map(item => item.amountMinor));
  const outstandingMinor = sum([deal.agreedMinor, -creditMinor, deal.direction === 'receive' ? -receivedMinor : -paidMinor, deal.direction === 'receive' ? paidMinor : receivedMinor]);
  return { agreedMinor: deal.agreedMinor, creditMinor, receivedMinor, paidMinor, outstandingMinor, direction: deal.direction };
}

export function validateWorkspace(state) {
  object(state, 'Workspace');
  requireValue(state.schemaVersion === 1 && state.mode === 'test', 'Only version 1 test workspaces can be opened.');
  identifier(state.id, 'Workspace ID');
  text(state.name, 'Workspace name', true, 200);
  integer(state.revision, 'Workspace revision');
  for (const key of MAPS) object(state[key], key);
  canonical(state); // Refuse non-JSON values and prototype-sensitive keys at import.
  const accepted = new Map();
  const receiptRevisions = new Set();
  for (const [id, operation] of Object.entries(state.operations)) {
    identifier(id, 'Operation ID'); object(operation, 'Operation'); object(operation.receipt, 'Operation receipt');
    const receipt = operation.receipt;
    requireValue(typeof operation.input === 'string' && receipt.operationId === id && KINDS.includes(receipt.kind), 'Invalid operation receipt.');
    identifier(receipt.workspaceId, 'Historical workspace ID');
    integer(receipt.revision, 'Receipt revision', 1);
    requireValue(receipt.revision <= state.revision && !receiptRevisions.has(receipt.revision), 'Invalid or duplicate receipt revision.');
    receiptRevisions.add(receipt.revision);
    timestamp(receipt.createdAt);
    let input;
    try { input = JSON.parse(operation.input); } catch { throw new Error('Operation input is not valid JSON.'); }
    object(input, 'Stored operation input'); object(input.payload, 'Stored operation payload');
    requireValue(canonical(input) === operation.input && input.id === id && input.kind === receipt.kind && input.createdAt === receipt.createdAt, 'Operation input does not match its receipt.');
    accepted.set(id, { ...input, receipt });
    if (receipt.dealId != null) requireValue(has(state.deals, receipt.dealId), 'Receipt deal is missing.');
    if (receipt.noteId != null) requireValue(has(state.notes, receipt.noteId), 'Receipt note is missing.');
    if (receipt.lotIds != null) {
      requireValue(Array.isArray(receipt.lotIds) && new Set(receipt.lotIds).size === receipt.lotIds.length, 'Receipt lots are invalid.');
      for (const lotId of receipt.lotIds) requireValue(has(state.lots, lotId), 'Receipt lot is missing.');
    }
  }
  const sourceFor = (id, kinds, dealId) => {
    const source = accepted.get(id);
    requireValue(source && kinds.includes(source.kind), 'Record has no matching accepted operation.');
    if (dealId != null) requireValue(source.receipt.dealId === dealId, 'Operation belongs to a different deal.');
    return source;
  };
  const expectedQuantity = new Map();
  const identity = lot => ({ id: lot.id, name: lot.name, set: lot.set, number: lot.number, language: lot.language, condition: lot.condition, grade: lot.grade, basisMinor: lot.basisMinor, ownership: lot.ownership, currency: lot.currency, lineage: lot.lineage, ...lotMetadata(lot) });
  for (const [id, lot] of Object.entries(state.lots)) {
    validateLot(lot, id); object(lot.lineage, 'Lot lineage');
    const source = sourceFor(lot.lineage.operationId, ['opening', 'deal', 'return']);
    requireValue(source.receipt.lotIds?.includes(id), 'Lot is missing from its source receipt.');
    let original;
    if (source.kind === 'opening') {
      original = source.payload.lots?.find(item => item.id === id);
      requireValue(lot.lineage.kind === 'opening', 'Opening lineage is invalid.');
    } else if (source.kind === 'deal') {
      original = source.payload.incoming?.find((item, index) => (item.id || `${source.id}-in-${index}`) === id);
      requireValue(lot.lineage.kind === source.payload.kind && lot.lineage.dealId === source.payload.dealId, 'Acquisition lineage is invalid.');
    } else {
      const line = source.payload.lines?.find((_item, index) => `${source.id}-return-${index}` === id);
      const deal = state.deals[source.payload.dealId];
      const sold = deal?.outgoing?.find(item => item.id === line?.lotId);
      original = sold && line ? { ...sold, quantity: line.quantity } : null;
      requireValue(lot.lineage.kind === 'return' && lot.lineage.dealId === source.payload.dealId && lot.lineage.sourceLotId === line?.lotId, 'Return lineage is invalid.');
    }
    requireValue(original, 'Lot has no originating stock input.');
    const normalized = newLot(original, id, lot.lineage);
    requireValue(canonical(identity(normalized)) === canonical(identity(lot)), 'Lot identity or unit basis differs from its acquisition.');
    expectedQuantity.set(id, normalized.quantity);
    const askChanges = [...accepted.values()].filter(item => item.kind === 'ask' && item.payload.lotId === id).sort((a, b) => a.receipt.revision - b.receipt.revision);
    requireValue(askChanges.every(item => item.receipt.revision > source.receipt.revision), 'Price change precedes its stock.');
    requireValue(lot.askMinor === (askChanges.length ? askChanges.at(-1).payload.askMinor : normalized.askMinor), 'Asking price does not match accepted history.');
  }
  for (const [id, deal] of Object.entries(state.deals)) {
    identifier(id, 'Deal ID');
    object(deal, 'Deal');
    requireValue(deal.id === id && ['sale', 'buy', 'trade'].includes(deal.kind) && deal.currency === 'EUR', 'Invalid deal identity or currency.');
    const source = sourceFor(deal.operationId, ['deal'], id);
    const original = source.payload;
    requireValue(original.dealId === id && deal.kind === original.kind && deal.agreedMinor === original.agreedMinor && deal.direction === original.direction && deal.occurredOn === original.occurredOn && deal.counterparty === (original.counterparty ?? '') && deal.note === (original.note ?? '') && deal.createdAt === source.createdAt, 'Original deal agreement was changed.');
    date(deal.occurredOn);
    for (const field of ['outgoing', 'incoming', 'payments', 'credits', 'returns']) requireValue(Array.isArray(deal[field]), `Deal ${field} history is incomplete.`);
    requireValue(deal.kind === 'sale' ? deal.outgoing.length > 0 && deal.incoming.length === 0 && deal.direction === 'receive' : deal.kind === 'buy' ? deal.outgoing.length === 0 && deal.incoming.length > 0 && deal.direction === 'pay' : deal.outgoing.length > 0 && deal.incoming.length > 0, 'Invalid stock or money direction for this deal.');
    requireValue(new Set(deal.outgoing.map(item => item.id)).size === deal.outgoing.length && new Set(deal.incoming.map(item => item.id)).size === deal.incoming.length, 'Duplicate deal stock lines.');
    requireValue(canonical(source.receipt.lotIds) === canonical([...deal.outgoing, ...deal.incoming].map(item => item.id)), 'Deal receipt stock does not match its accepted lines.');
    requireValue(deal.outgoing.length === original.outgoing?.length && deal.incoming.length === original.incoming?.length, 'Deal stock lines differ from accepted input.');
    for (const line of [...deal.outgoing, ...deal.incoming]) {
      validateLot(line); integer(line.quantity, 'Deal quantity', 1);
      requireValue(has(state.lots, line.id) && canonical(identity(line)) === canonical(identity(state.lots[line.id])), 'Deal stock identity or lineage is missing or changed.');
    }
    deal.outgoing.forEach((line, index) => {
      requireValue(line.excludedFromSale !== true, 'A deal cannot consume stock excluded from sale.');
      requireValue(line.id === original.outgoing[index].lotId && line.quantity === original.outgoing[index].quantity, 'Outgoing quantity differs from accepted input.');
      requireValue(accepted.get(line.lineage.operationId).receipt.revision < source.receipt.revision, 'A deal consumes stock before its acquisition.');
      expectedQuantity.set(line.id, sum([expectedQuantity.get(line.id), -line.quantity], 'Stock quantity'));
    });
    deal.incoming.forEach((line, index) => requireValue(line.id === (original.incoming[index].id || `${source.id}-in-${index}`) && line.quantity === original.incoming[index].quantity, 'Incoming quantity differs from accepted input.'));
    const paymentIds = new Set();
    for (const payment of deal.payments) {
      validatePayment(payment);
      requireValue(!paymentIds.has(payment.id), 'Duplicate payment.'); paymentIds.add(payment.id);
      const moneySource = sourceFor(payment.operationId, ['deal', 'payment'], id);
      requireValue(moneySource.receipt.revision >= source.receipt.revision, 'Payment precedes its deal.');
      const input = moneySource.payload;
      const expected = moneySource.kind === 'deal' ? { amountMinor: input.paymentMinor, direction: input.direction, method: input.method, occurredOn: input.occurredOn, note: '' } : { amountMinor: input.amountMinor, direction: input.direction, method: input.method, occurredOn: input.occurredOn, note: input.note ?? '' };
      requireValue(payment.id === `${moneySource.id}-money` && payment.createdAt === moneySource.createdAt && Object.entries(expected).every(([key, value]) => payment[key] === value), 'Money fact differs from its accepted input.');
    }
    const creditIds = new Set();
    for (const credit of deal.credits) {
      requireValue(!creditIds.has(credit.id), 'Duplicate credit.'); creditIds.add(credit.id);
      const creditSource = sourceFor(credit.operationId, ['credit', 'return'], id);
      requireValue(creditSource.receipt.revision > source.receipt.revision, 'Credit precedes its deal.');
      const amount = creditSource.kind === 'credit' ? creditSource.payload.amountMinor : creditSource.payload.creditMinor;
      requireValue(credit.amountMinor === amount && credit.reason === creditSource.payload.reason && credit.createdAt === creditSource.createdAt && credit.id === `${creditSource.id}-${creditSource.kind === 'return' ? 'return-credit' : 'credit'}`, 'Credit differs from its accepted input.');
      text(credit.reason, 'Credit reason', true);
    }
    getDealBalance(deal);
    const returnIds = new Set();
    for (const entry of deal.returns) {
      requireValue(deal.kind === 'sale' && !returnIds.has(entry.id), 'Invalid or duplicate physical return.'); returnIds.add(entry.id);
      const returnSource = sourceFor(entry.operationId, ['return'], id);
      requireValue(returnSource.receipt.revision > source.receipt.revision, 'Return precedes its sale.');
      requireValue(entry.id === `${returnSource.id}-return` && entry.createdAt === returnSource.createdAt && entry.reason === returnSource.payload.reason && entry.creditMinor === (returnSource.payload.creditMinor ?? 0), 'Return differs from its accepted input.');
      requireValue(Array.isArray(entry.lines), 'Return lines are missing.');
      requireValue(entry.lines.length === returnSource.payload.lines?.length, 'Returned lines differ from accepted input.');
      requireValue(new Set(entry.lines.map(item => item.lotId)).size === entry.lines.length, 'Duplicate returned lines.');
      for (const [index, line] of entry.lines.entries()) {
        identifier(line.lotId); identifier(line.returnLotId); integer(line.quantity, 'Return quantity', 1);
        requireValue(has(state.lots, line.returnLotId), 'Returned stock is missing.');
        requireValue(line.lotId === returnSource.payload.lines[index].lotId && line.quantity === returnSource.payload.lines[index].quantity && line.returnLotId === `${returnSource.id}-return-${index}`, 'Return quantity differs from accepted input.');
      }
    }
    for (const line of deal.outgoing) {
      const returned = sum(deal.returns.flatMap(item => item.lines).filter(item => item.lotId === line.id).map(item => item.quantity), 'Returned quantity');
      requireValue(returned <= line.quantity, 'Returned quantity exceeds the original sale.');
    }
  }
  for (const [id, quantity] of expectedQuantity) requireValue(quantity >= 0 && quantity === state.lots[id].quantity, 'Stock quantity does not reconcile to accepted movements.');
  for (const [id, draft] of Object.entries(state.drafts)) {
    identifier(id, 'Draft ID'); object(draft, 'Draft');
    requireValue(draft.id === id, 'Draft map ID does not match its record.');
    integer(draft.revision, 'Draft revision');
    requireValue(['open', 'completed'].includes(draft.status), 'Draft status is invalid.');
    validateDraftPayload(draft.payload);
    if (draft.status === 'completed' || draft.completedBy) {
      const source = sourceFor(draft.completedBy, ['deal'], draft.completedDealId);
      requireValue(source.payload.draftId === id, 'Completed draft has no matching consumed intent.');
      requireValue(draft.status === 'completed' && draft.payload && canonical(businessPayload(draft.payload)) === canonical(businessPayload(source.payload)), 'Completed draft terms or status were changed.');
    }
  }
  for (const [id, note] of Object.entries(state.notes)) {
    identifier(id, 'Note ID'); object(note, 'Note');
    requireValue(note.id === id, 'Note map ID does not match its record.');
    text(note.text, 'Note', true);
    const source = sourceFor(note.operationId, ['note']);
    requireValue(source.receipt.noteId === id && note.id === (source.payload.id || `${source.id}-note`) && note.text === source.payload.text && note.createdAt === source.createdAt && note.source === 'owner_report' && note.dealId === source.payload.dealId && canonical(note.assetIds) === canonical(source.payload.assetIds ?? []), 'Note differs from its accepted input.');
    requireValue(Array.isArray(note.assetIds), 'Note assets must be a list.');
    for (const assetId of note.assetIds) requireValue(has(state.assets, assetId), 'Note attachment is missing.');
    if (note.dealId != null) requireValue(has(state.deals, note.dealId), 'Note deal is missing.');
  }
  for (const source of accepted.values()) {
    const p = source.payload;
    if (['deal', 'payment', 'credit', 'return'].includes(source.kind)) {
      requireValue(source.receipt.dealId === p.dealId && has(state.deals, p.dealId), 'Accepted operation has no matching deal.');
      const deal = state.deals[p.dealId];
      if (source.kind === 'deal') requireValue(deal.operationId === source.id && (!(p.paymentMinor > 0) || deal.payments.some(item => item.operationId === source.id)), 'Accepted deal or initial money is missing.');
      if (source.kind === 'deal' && p.draftId != null) requireValue(state.drafts[p.draftId]?.completedBy === source.id, 'Accepted deal has lost its consumed draft claim.');
      if (source.kind === 'payment') requireValue(deal.payments.some(item => item.operationId === source.id), 'Accepted money is missing.');
      if (source.kind === 'credit') requireValue(deal.credits.some(item => item.operationId === source.id), 'Accepted credit is missing.');
      if (source.kind === 'return') requireValue(deal.returns.some(item => item.operationId === source.id) && (!(p.creditMinor > 0) || deal.credits.some(item => item.operationId === source.id)), 'Accepted return or credit is missing.');
    }
    if (source.kind === 'opening') requireValue(Array.isArray(p.lots) && p.lots.every(item => state.lots[item.id]?.lineage.operationId === source.id), 'Accepted opening stock is missing.');
    if (source.kind === 'ask') {
      if (p.askMinor !== null) integer(p.askMinor, 'Accepted asking price');
      requireValue(has(state.lots, p.lotId) && source.receipt.lotIds?.includes(p.lotId), 'Accepted price change has no stock.');
    }
    if (source.kind === 'note') requireValue(state.notes[source.receipt.noteId]?.operationId === source.id, 'Accepted note is missing.');
  }
  for (const [id, asset] of Object.entries(state.assets)) {
    identifier(id, 'Asset ID'); object(asset, 'Asset');
    requireValue(asset.id === id, 'Asset map ID does not match its record.');
    integer(asset.size, 'Asset size');
    text(asset.name, 'Asset name', true, 500); text(asset.type, 'Asset type', false, 200);
    requireValue(typeof asset.sha256 === 'string' && /^[a-f0-9]{64}$/.test(asset.sha256), 'Asset hash is invalid.');
  }
  return true;
}

function findDeal(state, id) {
  identifier(id, 'Deal ID');
  requireValue(has(state.deals, id), 'This deal was not found.');
  return state.deals[id];
}

function addCredit(deal, amountMinor, reason, op, suffix = 'credit') {
  integer(amountMinor, 'Credit amount', 1);
  text(reason, 'Credit reason', true);
  const balance = getDealBalance(deal);
  requireValue(amountMinor <= balance.agreedMinor - balance.creditMinor, 'Credit exceeds the remaining agreement.');
  deal.credits.push({ id: `${op.id}-${suffix}`, amountMinor, reason, operationId: op.id, createdAt: op.createdAt });
}

function appendPayment(deal, raw, op) {
  eur(raw);
  const payment = { id: `${op.id}-money`, amountMinor: raw.amountMinor, direction: raw.direction, method: raw.method, occurredOn: raw.occurredOn, note: raw.note ?? '', operationId: op.id, createdAt: op.createdAt };
  validatePayment(payment);
  deal.payments.push(payment);
  getDealBalance(deal); // Range validation; overpayments stay visible, never clipped.
}

function businessPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'draftId' && key !== 'draftRevision'));
}

export function applyOperation(state, operation) {
  validateWorkspace(state);
  object(operation, 'Operation');
  identifier(operation.id, 'Operation ID');
  requireValue(KINDS.includes(operation.kind), 'Unsupported operation.');
  timestamp(operation.createdAt);
  object(operation.payload, 'Operation payload');
  const input = canonical({ id: operation.id, kind: operation.kind, createdAt: operation.createdAt, payload: operation.payload });
  if (has(state.operations, operation.id)) {
    const prior = state.operations[operation.id];
    requireValue(prior.input === input, 'This operation ID already has different input. Recover the original operation.');
    return { state, receipt: copy(prior.receipt) };
  }
  const next = copy(state);
  const op = copy(operation);
  const p = op.payload;
  eur(p);
  const receipt = { workspaceId: state.id, operationId: op.id, kind: op.kind, revision: integer(state.revision + 1, 'Workspace revision'), createdAt: op.createdAt };

  if (op.kind === 'opening') {
    requireValue(Array.isArray(p.lots) && p.lots.length > 0 && p.lots.length <= 100, 'Enter between 1 and 100 opening lots.');
    receipt.lotIds = [];
    for (const raw of p.lots) {
      const lot = newLot(raw, raw.id, { kind: 'opening', operationId: op.id });
      requireValue(!has(next.lots, lot.id), 'This lot ID already exists.');
      next.lots[lot.id] = lot; receipt.lotIds.push(lot.id);
    }
  } else if (op.kind === 'ask') {
    identifier(p.lotId, 'Lot ID'); requireValue(has(next.lots, p.lotId), 'This lot was not found.');
    if (p.askMinor !== null) integer(p.askMinor, 'Asking price');
    next.lots[p.lotId].askMinor = p.askMinor; receipt.lotIds = [p.lotId];
  } else if (op.kind === 'deal') {
    identifier(p.dealId, 'Deal ID'); requireValue(!has(next.deals, p.dealId), 'This deal ID already exists.');
    requireValue(['sale', 'buy', 'trade'].includes(p.kind), 'Choose sale, buy or trade.');
    requireValue(Array.isArray(p.outgoing) && Array.isArray(p.incoming) && p.outgoing.length <= 100 && p.incoming.length <= 100, 'Deal lines are invalid or exceed 100 per side.');
    requireValue(p.kind === 'sale' ? p.outgoing.length > 0 && p.incoming.length === 0 : p.kind === 'buy' ? p.outgoing.length === 0 && p.incoming.length > 0 : p.outgoing.length > 0 && p.incoming.length > 0, 'The selected deal needs the correct incoming and outgoing stock.');
    integer(p.agreedMinor, 'Agreement amount'); direction(p.direction);
    requireValue(p.kind !== 'sale' || p.direction === 'receive', 'A sale agreement must receive money.');
    requireValue(p.kind !== 'buy' || p.direction === 'pay', 'A purchase agreement must pay money.');
    date(p.occurredOn); text(p.counterparty ?? '', 'Counterparty', false, 500); text(p.note ?? '', 'Deal note');
    let draft;
    if (p.draftId != null || p.draftRevision != null) {
      identifier(p.draftId, 'Draft ID'); integer(p.draftRevision, 'Draft revision');
      draft = next.drafts[p.draftId];
      requireValue(draft && draft.status !== 'completed' && !draft.completedBy, 'This draft was already completed or is missing.');
      requireValue(draft.revision === p.draftRevision, 'This draft changed. Reopen its current version.');
      requireValue(draft.payload && canonical(businessPayload(draft.payload)) === canonical(businessPayload(p)), 'This pilot completes a whole saved deal. Keep partial or changed terms as a separate draft first.');
    }
    const deal = { id: p.dealId, kind: p.kind, currency: 'EUR', agreedMinor: p.agreedMinor, direction: p.direction, occurredOn: p.occurredOn, counterparty: p.counterparty ?? '', note: p.note ?? '', outgoing: [], incoming: [], payments: [], credits: [], returns: [], operationId: op.id, createdAt: op.createdAt };
    const selected = new Set();
    for (const line of p.outgoing) {
      identifier(line.lotId, 'Outgoing lot ID'); integer(line.quantity, 'Outgoing quantity', 1);
      requireValue(!selected.has(line.lotId), 'An outgoing lot is repeated. Combine its selected quantity.'); selected.add(line.lotId);
      const lot = next.lots[line.lotId];
      requireValue(lot && lot.ownership === 'owned', 'The selected owned lot was not found.');
      requireValue(lot.excludedFromSale !== true, `${lot.name} is excluded from sale and cannot leave stock in this test deal.`);
      requireValue(lot.quantity >= line.quantity, `Not enough available stock for ${lot.name}. Your input is preserved.`);
      deal.outgoing.push({ ...copy(lot), quantity: line.quantity });
      lot.quantity -= line.quantity;
    }
    p.incoming.forEach((raw, index) => {
      const lot = newLot(raw, raw.id || `${op.id}-in-${index}`, { kind: p.kind, dealId: deal.id, operationId: op.id, lineIndex: index });
      requireValue(!has(next.lots, lot.id), 'An incoming lot ID already exists.');
      next.lots[lot.id] = lot; deal.incoming.push(copy(lot));
    });
    integer(p.paymentMinor ?? 0, 'Initial payment');
    if (p.paymentMinor > 0) appendPayment(deal, { amountMinor: p.paymentMinor, direction: p.direction, method: p.method, occurredOn: p.occurredOn, note: '' }, op);
    next.deals[deal.id] = deal; receipt.dealId = deal.id; receipt.lotIds = [...deal.outgoing, ...deal.incoming].map(lot => lot.id);
    if (draft) { draft.status = 'completed'; draft.completedBy = op.id; draft.completedDealId = deal.id; draft.revision += 1; draft.updatedAt = op.createdAt; }
  } else if (op.kind === 'payment') {
    const deal = findDeal(next, p.dealId); appendPayment(deal, p, op); receipt.dealId = deal.id;
  } else if (op.kind === 'credit') {
    const deal = findDeal(next, p.dealId); addCredit(deal, p.amountMinor, p.reason, op); receipt.dealId = deal.id;
  } else if (op.kind === 'return') {
    const deal = findDeal(next, p.dealId);
    requireValue(deal.kind === 'sale', 'This pilot supports physical returns against sales only.');
    text(p.reason, 'Return reason', true);
    requireValue(Array.isArray(p.lines) && p.lines.length > 0 && p.lines.length <= 100, 'Select the returned sale quantities.');
    const selected = new Set();
    const entry = { id: `${op.id}-return`, lines: [], creditMinor: p.creditMinor ?? 0, reason: p.reason, operationId: op.id, createdAt: op.createdAt };
    integer(entry.creditMinor, 'Return credit');
    p.lines.forEach((line, index) => {
      identifier(line.lotId, 'Returned lot ID'); integer(line.quantity, 'Return quantity', 1);
      requireValue(!selected.has(line.lotId), 'A returned lot is repeated.'); selected.add(line.lotId);
      const original = deal.outgoing.find(lot => lot.id === line.lotId);
      requireValue(original, 'This lot was not part of the original sale.');
      const returned = sum(deal.returns.flatMap(item => item.lines).filter(item => item.lotId === line.lotId).map(item => item.quantity), 'Returned quantity');
      requireValue(line.quantity <= original.quantity - returned, 'Return exceeds the remaining sold quantity.');
      const returnLotId = `${op.id}-return-${index}`;
      requireValue(!has(next.lots, returnLotId), 'This return lot already exists.');
      next.lots[returnLotId] = newLot({ ...original, quantity: line.quantity }, returnLotId, { kind: 'return', dealId: deal.id, sourceLotId: original.id, operationId: op.id });
      entry.lines.push({ lotId: original.id, quantity: line.quantity, returnLotId });
    });
    if (entry.creditMinor > 0) addCredit(deal, entry.creditMinor, p.reason, op, 'return-credit');
    deal.returns.push(entry); receipt.dealId = deal.id; receipt.lotIds = entry.lines.map(line => line.returnLotId);
  } else if (op.kind === 'note') {
    const id = identifier(p.id || `${op.id}-note`, 'Note ID'); requireValue(!has(next.notes, id), 'This note ID already exists.');
    text(p.text, 'Note', true); requireValue(Array.isArray(p.assetIds ?? []) && new Set(p.assetIds ?? []).size === (p.assetIds ?? []).length, 'Note attachments must be a unique list.');
    for (const assetId of p.assetIds ?? []) { identifier(assetId, 'Asset ID'); requireValue(has(next.assets, assetId), 'An attachment is missing. Save it before linking.'); }
    if (p.dealId != null) findDeal(next, p.dealId);
    next.notes[id] = { id, text: p.text, assetIds: p.assetIds ?? [], ...(p.dealId != null ? { dealId: p.dealId } : {}), source: 'owner_report', operationId: op.id, createdAt: op.createdAt };
    receipt.noteId = id; if (p.dealId != null) receipt.dealId = p.dealId;
  }
  next.revision = receipt.revision;
  next.operations[op.id] = { input, receipt: copy(receipt) };
  validateWorkspace(next);
  return { state: next, receipt };
}

export function seedDemoWorkspace() {
  const state = createWorkspace({ id: 'demo-weekend', name: 'Invented show stock — test only' });
  return applyOperation(state, {
    id: 'demo-opening', kind: 'opening', createdAt: '2026-10-31T08:00:00.000Z',
    payload: { lots: [
      { id: 'demo-pikachu', name: 'Pikachu — invented fixture', set: 'Demo set', number: '025', language: 'English', condition: 'NM', grade: '', quantity: 3, askMinor: 3000, basisMinor: null, ownership: 'owned' },
      { id: 'demo-charizard', name: 'Charizard — invented fixture', set: 'Demo set', number: '006', language: 'Japanese', condition: 'NM', grade: 'PSA 9', quantity: 1, askMinor: 12500, basisMinor: 8000, ownership: 'owned' },
    ] },
  }).state;
}
