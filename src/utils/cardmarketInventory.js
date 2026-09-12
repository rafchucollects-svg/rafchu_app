function hasManualPrice(item) {
  return [item.overridePrice, item.manualPrice].some(value =>
    (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value)) && Number(value) >= 0);
}

// Apply the same inventory scope to matching, capture and selected price updates.
export function cardmarketInventoryScope(items, manualOnly = true) {
  return items.filter(item => !item.isGraded && !item.grade && !item.gradingCompany && !item.isSealed &&
    (!manualOnly || hasManualPrice(item)));
}
