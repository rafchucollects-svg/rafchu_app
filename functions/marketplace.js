const { FieldPath } = require('firebase-admin/firestore');
const { publicProfile, publicInventory } = require('./publicData');
async function listMarketplacePage(db, cursor = null) {
  let query = db.collection('public_inventories').orderBy(FieldPath.documentId()).limit(12);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  const vendors = [];
  for (const snapshot of page.docs) {
    // Always check current access/sharing; a projection may be awaiting its trigger.
    const [source, user, ownerAdmin] = await db.getAll(db.doc(`collections/${snapshot.id}`), db.doc(`users/${snapshot.id}`), db.doc(`admins/${snapshot.id}`));
    const profile = publicProfile(user.data() || {}, ownerAdmin.exists);
    if (!user.exists || !source.data()?.shareEnabled || !profile.isVendor) continue;
    const listing = publicInventory(source.data(), profile);
    const stats = snapshot.data().ratingStats || {};
    vendors.push({ userId: snapshot.id, profile, inventory: listing.items, totalCards: listing.items.length, roundUpPrices: listing.roundUp || false, totalRatings: stats.total || 0, ratingPercentage: stats.total ? Math.round(100 * (stats.positive || 0) / stats.total) : null });
  }
  return { vendors, nextCursor: page.size === 12 ? page.docs.at(-1).id : null };
}
module.exports = { listMarketplacePage };
