import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { saveItemChanges } from '../src/utils/inventoryStore.js';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { syncPublicUser, syncWishlist, syncRating } = require('./publicData');
const projectId = 'demo-rafchu-review';
// Pin Admin SDK as well as browser clients to the disposable emulator.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
let env, server;
const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const guest = () => env.unauthenticatedContext().firestore();
globalThis.window = new EventTarget();
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules','utf8'), host: '127.0.0.1', port: 8080 } });
  server = admin.initializeApp({ projectId }, 'review-tests').firestore();
});
after(async () => { await env.cleanup(); await server.terminate(); await admin.app('review-tests').delete(); });
beforeEach(async () => {
  await env.clearFirestore();
  await server.doc('users/alice').set({ username: 'Alice', email: 'private@example.com', vendorAccess: { enabled: true, status: 'active' } });
  await server.doc('users/bob').set({ username: 'Bob' });
  await server.doc('collections/alice').set({ shareEnabled: true, cashData: { secret: 10 }, items: [{ entryId: 'a', name: 'Pikachu', quantity: 1, buyPrice: 10 }, { entryId: 'hidden', name: 'Hidden', excludeFromSale: true }] });
  await server.doc('conversations/chat').set({ participants: ['alice','bob'] });
});
test('private profiles/inventory/wishlists are owner-only; public projection is allowlisted', async () => {
  await assertFails(getDoc(doc(guest(),'users','alice')));
  await assertFails(getDoc(doc(bob(),'collections','alice')));
  await assertSucceeds(getDoc(doc(alice(),'collections','alice')));
  await assertFails(getDoc(doc(bob(),'collector_wishlists','alice')));
  await syncPublicUser(server, 'alice');
  const result = await assertSucceeds(getDoc(doc(guest(),'public_inventories','alice')));
  assert.equal(result.data().items.length, 1);
  assert.equal(result.data().items[0].buyPrice, undefined);
  assert.equal(result.data().cashData, undefined);
  const profile = await getDoc(doc(guest(),'public_profiles','alice'));
  assert.equal(profile.data().email, undefined);
  await assertFails(setDoc(doc(alice(),'public_profiles','alice'), { isVendor: true }));
  await server.doc('collections/alice').update({ shareEnabled: false });
  await assertFails(getDoc(doc(guest(),'public_inventories','alice')));
  await syncPublicUser(server,'alice');
  assert.equal((await server.doc('public_inventories/alice').get()).exists,false);
});
test('wishlist and all tax sections save only for their owner', async () => {
  for (const path of ['collector_wishlists/alice', 'tax_loss_carry/alice/years/year_2026', 'tax_mileage/alice/trips/trip', 'tax_benefits/alice/entries/benefit']) {
    await assertSucceeds(setDoc(doc(alice(),path), { items: [], amount: 20 }));
    await assertFails(setDoc(doc(bob(),path), { amount: 30 }));
  }
});
test('users cannot grant vendor/admin privileges', async () => {
  await assertFails(updateDoc(doc(alice(),'users/alice'), { vendorAccess: { enabled: true } }));
  await assertFails(updateDoc(doc(alice(),'users/alice'), { isAdmin: true }));
  const spoof = env.authenticatedContext('imposter', { email: 'rafchucollects@gmail.com', email_verified: false }).firestore();
  await assertFails(setDoc(doc(spoof,'admins/imposter'), {}));
});
test('message participants cannot impersonate or edit the other author', async () => {
  await assertSucceeds(setDoc(doc(alice(),'conversations/chat/messages/m'), { senderId: 'alice', text: 'Hello', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(bob(),'conversations/chat/messages/fake'), { senderId: 'alice', text: 'Forged', createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(bob(),'conversations/chat/messages/m'), { text: 'Forged' }));
  await assertFails(deleteDoc(doc(bob(),'conversations/chat/messages/m')));
  await assertSucceeds(updateDoc(doc(alice(),'conversations/chat/messages/m'), { text: 'Edited' }));
});
test('ratings require both parties to confirm and cannot be duplicated', async () => {
  const txRef = doc(alice(),'transactions/deal');
  await assertFails(setDoc(txRef, { conversationId:'chat', buyerId:'alice', sellerId:'bob', status:'completed', buyerConfirmedAt:serverTimestamp(), sellerConfirmedAt:serverTimestamp() }));
  await assertSucceeds(setDoc(txRef, { conversationId:'chat', buyerId:'alice', sellerId:'bob', status:'buyer_confirmed', buyerConfirmedAt:serverTimestamp(), sellerConfirmedAt:null }));
  const rating = { transactionId:'deal', fromUserId:'alice', toUserId:'bob', thumbsUp:true, createdAt:serverTimestamp() };
  await assertFails(setDoc(doc(alice(),'ratings/deal_alice'), rating));
  await assertFails(updateDoc(txRef, { status:'completed', sellerConfirmedAt:serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(bob(),'transactions/deal'), { status:'completed', sellerConfirmedAt:serverTimestamp() }));
  await assertSucceeds(setDoc(doc(alice(),'ratings/deal_alice'), rating));
  await assertFails(setDoc(doc(alice(),'ratings/duplicate'), rating));
  await assertFails(setDoc(doc(alice(),'ratings/deal_alice'), rating));
  await syncRating(server,'deal_alice'); await syncRating(server,'deal_alice');
  assert.deepEqual((await server.doc('public_vendor_stats/bob').get()).data(), {total:1,positive:1});
});
test('transactional inventory updates preserve concurrent additions and archive deletions', async () => {
  const ref = doc(alice(),'collections/alice');
  const before = (await getDoc(ref)).data().items;
  await Promise.all([
    saveItemChanges(ref,before,[...before,{entryId:'b',name:'B'}]),
    saveItemChanges(ref,before,[...before,{entryId:'c',name:'C'}]),
  ]);
  assert.equal((await getDoc(ref)).data().items.length,4);
  await saveItemChanges(ref,before,before.filter(item => item.entryId !== 'a'));
  assert.equal((await getDoc(ref)).data().items.length,3);
  assert.equal((await getDoc(doc(alice(),'collections/alice/trash/a'))).data().item.buyPrice,10);
  await assertFails(getDoc(doc(bob(),'collections/alice/trash/a')));
});
test('wishlist projections count unique users, process retries and remove deleted demand', async () => {
  await server.doc('collector_wishlists/alice').set({ items: [{ cardId:'p',name:'Pikachu' },{cardId:'p',name:'Pikachu'}] });
  await syncWishlist(server,'alice'); await syncWishlist(server,'alice');
  let counts = await server.collection('public_wishlist_counts').get();
  assert.equal(counts.docs[0].data().wishlistCount,1);
  await server.doc('collector_wishlists/alice').delete();
  await syncWishlist(server,'alice');
  counts = await server.collection('public_wishlist_counts').get();
  assert.equal(counts.size,0);
});

test('marketplace reads sanitized listings and honors immediate sharing revocation', async () => {
  const { listMarketplacePage } = require('./marketplace');
  await syncPublicUser(server,'alice');
  const first = await listMarketplacePage(server);
  assert.equal(first.vendors.length,1);
  assert.equal(first.vendors[0].inventory.length,1);
  assert.equal(first.vendors[0].inventory[0].buyPrice,undefined);
  assert.equal(first.vendors[0].profile.email,undefined);
  await server.doc('collections/alice').update({shareEnabled:false});
  assert.equal((await listMarketplacePage(server)).vendors.length,0);
});
