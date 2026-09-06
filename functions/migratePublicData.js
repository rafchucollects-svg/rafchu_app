/* Additive, restartable migration. Never prints user data or credentials.
 * node functions/migratePublicData.js --dry-run
 * node functions/migratePublicData.js --apply
 */
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { syncPublicUser, syncWishlist, syncRating, publicProfile, publicInventory } = require('./publicData');
const projectId = 'rafchu-tcg-app';
const account = 'rafchucollects@gmail.com';
const apply = process.argv.includes('--apply');
let personalToken, personalTokenExpires = 0;
function getPersonalToken() {
  if (!personalToken || Date.now() >= personalTokenExpires) {
    personalToken = execFileSync('gcloud', ['auth', 'print-access-token', `--account=${account}`], { encoding: 'utf8' }).trim();
    personalTokenExpires = Date.now() + 3000 * 1000;
  }
  return personalToken;
}
admin.initializeApp({ projectId, credential: {
  getAccessToken: async () => ({ access_token: getPersonalToken(), expires_in: 3500 }),
} });
const { Firestore } = require('@google-cloud/firestore');
const grpc = require('@grpc/grpc-js');
// Pin transport credentials to the explicitly selected personal account rather
// than allowing an unrelated Application Default Credentials file to win.
const sslCreds = grpc.credentials.combineChannelCredentials(grpc.credentials.createSsl(), grpc.credentials.createFromMetadataGenerator((_, callback) => {
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${getPersonalToken()}`);
  metadata.set('x-goog-user-project', projectId);
  callback(null, metadata);
}));
const db = new Firestore({ projectId, sslCreds });

async function eachDocument(name, callback) {
  let cursor;
  let count = 0;
  while (true) {
    let query = db.collection(name).orderBy(admin.firestore.FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const document of page.docs) { await callback(document); count++; }
    if (page.size < 100) break;
    cursor = page.docs.at(-1);
  }
  return count;
}
async function main() {
  const token = await admin.app().options.credential.getAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId }, body: JSON.stringify({ email: [account] }) });
  if (!response.ok) throw new Error(`Owner lookup failed (${response.status}).`);
  const owner = (await response.json()).users?.[0];
  if (!owner) throw new Error('Owner account not found.');
  owner.uid = owner.localId;
  if (!owner.emailVerified) throw new Error('Owner email must be verified before migration.');
  if (apply) await db.doc(`admins/${owner.uid}`).set({ role: 'owner' }, { merge: true });
  const counts = {};
  for (const name of ['collections', 'collector_collections', 'collector_wishlists']) {
    counts[name] = await eachDocument(name, async document => {
      if (!apply) return;
      await db.runTransaction(async tx => {
        const fresh = await tx.get(document.ref);
        const items = fresh.data()?.items || [];
        if (items.some(item => !item.entryId)) tx.set(document.ref, { items: items.map(item => ({ ...item, entryId: item.entryId || crypto.randomUUID() })) }, { merge: true });
      });
    });
  }
  counts.ratings = await eachDocument('ratings', async doc => { if (apply) await syncRating(db, doc.id); });
  counts.wishlists = await eachDocument('collector_wishlists', async doc => { if (apply) await syncWishlist(db, doc.id); });
  counts.users = await eachDocument('users', async doc => { if (apply) await syncPublicUser(db, doc.id); });
  if (process.argv.includes('--verify')) {
    const assert = require('node:assert/strict');
    await eachDocument('users', async user => {
      const [adminDoc, profile, inventory, published, collection, sharedCollection] = await db.getAll(...['admins', 'public_profiles', 'collections', 'public_inventories', 'collector_collections', 'public_collections'].map(name => db.doc(`${name}/${user.id}`)));
      const expectedProfile = publicProfile(user.data(), adminDoc.exists);
      assert.deepEqual(profile.data(), expectedProfile, 'Public profile mismatch');
      for (const [source, projection, eligible] of [[inventory,published,expectedProfile.isVendor], [collection,sharedCollection,true]]) {
        if (source.data()?.shareEnabled === true && eligible) {
          assert.equal(projection.exists,true,'Missing public inventory');
          const { userId: _uid, ratingStats: _ratings, ...actual } = projection.data();
          assert.deepEqual(actual,publicInventory(source.data(),expectedProfile),'Public inventory mismatch');
        } else assert.equal(projection.exists,false,'Unexpected public inventory');
      }
    });
  }
  console.log(JSON.stringify({ projectId, mode: apply ? 'applied' : process.argv.includes('--verify') ? 'verified' : 'dry-run', counts }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.terminate());
