const crypto = require('node:crypto');

// Explicit allowlists keep newly introduced accounting fields private by default.
const CARD_FIELDS = ['entryId', 'cardId', 'id', 'name', 'set', 'setName', 'setCode', 'setSeries', 'number', 'rarity', 'image', 'condition', 'quantity', 'language', 'isJapanese', 'variant', 'variantSource', 'isGraded', 'gradingCompany', 'grade', 'gradedPrice', 'gradedPriceCurrency', 'isManualEntry', 'manualPrice', 'manualPriceCurrency', 'overridePrice', 'overridePriceCurrency', 'sellPrice', 'tradePrice', 'calculatedSuggestedPrice', 'pricesLastUpdated', 'dataSource', 'addedAt', 'forTrade'];
const PROFILE_FIELDS = ['username', 'displayName', 'photoURL', 'country', 'businessName', 'bio'];
const PRICE_FIELDS = ['currency', 'market', 'market_price', 'mid', 'mid_price', 'low', 'high', 'average', 'avg1', 'avg7', 'avg30', 'trend', 'trendPrice', 'lowest', 'lowest_near_mint', 'lowestNearMint', 'lowestExPlus', 'suggested', '7d_average', '30d_average', 'availableItems', 'available_items', 'updatedAt'];
const pick = (data, keys) => Object.fromEntries(keys.filter(key => data?.[key] != null && ['string','number','boolean'].includes(typeof data[key])).map(key => [key, data[key]]));

function publicCard(item) {
  const result = pick(item, CARD_FIELDS);
  result.prices = {};
  for (const provider of ['cardmarket', 'tcgplayer', 'tcg_player', 'ebay']) {
    if (!item.prices?.[provider]) continue;
    result.prices[provider] = pick(item.prices[provider], PRICE_FIELDS);
    // Preserve standard printing prices without copying arbitrary nested metadata.
    for (const variant of ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil', '1stEditionNormal', 'unlimitedHolofoil', 'unlimitedNormal']) {
      if (item.prices[provider][variant]) result.prices[provider][variant] = pick(item.prices[provider][variant], PRICE_FIELDS);
    }
  }
  return result;
}
function publicProfile(profile, isAdmin = false) {
  const isVendor = isAdmin || (profile?.vendorAccess?.enabled === true && profile?.vendorAccess?.status === 'active');
  return { ...pick(profile, PROFILE_FIELDS), isVendor };
}
function publicInventory(data, profile) {
  return {
    ...pick(data, ['shareUsername', 'roundUp', 'marketSource', 'currency', 'secondaryCurrency']),
    shareEnabled: data?.shareEnabled === true,
    profile,
    items: (data?.items || []).filter(item => !item.excludeFromSale).map(publicCard),
  };
}
function cardKey(card) {
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return card.cardId ? String(card.cardId) : [card.name, card.set, card.number].map(normalize).join('|');
}
const keyId = key => crypto.createHash('sha256').update(key).digest('hex');

// Read the CURRENT source in a transaction, rather than trusting an event's
// payload: Firestore events may arrive out of order or more than once.
async function syncPublicUser(db, uid) {
  await db.runTransaction(async tx => {
    const refs = ['users', 'admins', 'collections', 'collector_collections', 'public_vendor_stats'].map(name => db.doc(`${name}/${uid}`));
    const [user, admin, inventory, collection, stats] = await tx.getAll(...refs);
    const profile = publicProfile(user.data() || {}, admin.exists);
    const profileRef = db.doc(`public_profiles/${uid}`);
    if (user.exists) tx.set(profileRef, profile); else tx.delete(profileRef);
    for (const [source, destination, vendorOnly] of [[inventory, 'public_inventories', true], [collection, 'public_collections', false]]) {
      const ref = db.doc(`${destination}/${uid}`);
      if (user.exists && source.data()?.shareEnabled === true && (!vendorOnly || profile.isVendor)) {
        tx.set(ref, { ...publicInventory(source.data(), profile), userId: uid, ratingStats: stats.data() || { total: 0, positive: 0 } });
      } else tx.delete(ref);
    }
  });
}

async function syncWishlist(db, uid) {
  const source = db.doc(`collector_wishlists/${uid}`);
  const state = db.doc(`private_wishlist_projection/${uid}`);
  let hasMore;
  do {
    hasMore = await db.runTransaction(async tx => {
      const [snapshot, previous] = await tx.getAll(source, state);
      const cards = new Map((snapshot.data()?.items || []).map(item => [keyId(cardKey(item)), item]));
      const old = new Set(previous.data()?.keys || []);
      const changes = [...new Set([...old, ...cards.keys()])].filter(key => old.has(key) !== cards.has(key));
      const changed = changes.slice(0, 150);
      if (!changed.length) return false;
      const docs = await tx.getAll(...changed.map(key => db.doc(`public_wishlist_counts/${key}`)));
      for (let i = 0; i < changed.length; i++) {
        const key = changed[i];
        const card = cards.get(key);
        const count = Math.max(0, (docs[i].data()?.wishlistCount || 0) + (card ? 1 : -1));
        if (!count) tx.delete(docs[i].ref);
        else tx.set(docs[i].ref, { ...(card ? publicCard(card) : docs[i].data()), key: card ? cardKey(card) : docs[i].data().key, wishlistCount: count, userCount: count });
        if (card) old.add(key); else old.delete(key);
      }
      tx.set(state, { keys: [...old] });
      return changes.length > changed.length;
    });
  } while (hasMore);
}

async function syncRating(db, ratingId) {
  await db.runTransaction(async tx => {
    const source = await tx.get(db.doc(`ratings/${ratingId}`));
    const rating = source.data();
    if (!rating?.toUserId) return;
    const marker = db.doc(`private_rating_projection/${ratingId}`);
    const statsRef = db.doc(`public_vendor_stats/${rating.toUserId}`);
    const [processed, stats] = await tx.getAll(marker, statsRef);
    if (processed.exists) return;
    tx.set(statsRef, { total: (stats.data()?.total || 0) + 1, positive: (stats.data()?.positive || 0) + (rating.thumbsUp === true ? 1 : 0) });
    tx.set(marker, { processed: true });
  });
}
module.exports = { publicCard, publicProfile, publicInventory, syncPublicUser, syncWishlist, syncRating };
