import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { syncPublicUser, syncWishlist } = require('./publicData');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('This script only runs against the local demo emulators.');
admin.initializeApp({ projectId: 'demo-rafchu-review' });
const db = admin.firestore();
const uid = 'review-vendor';
try { await admin.auth().createUser({ uid, email: 'review@example.test', password: 'Review-local-2026!', emailVerified: true }); }
catch (error) { if (error.code !== 'auth/uid-already-exists') throw error; }
await db.doc(`users/${uid}`).set({ username:'Review vendor', email:'review@example.test', onboardingCompleted:true, country:'FI', vendorAccess:{enabled:true,status:'active'} });
const cards = [
  { entryId:'pikachu', cardId:'base1-58', name:'Pikachu', set:'Base Set', number:'58', condition:'NM', quantity:2, prices:{cardmarket:{avg30:20,lowest:15,currency:'EUR'}}, buyPrice:8, pricesLastUpdated:'2026-09-06', addedAt:Date.now() },
  { entryId:'charizard', cardId:'base1-4', name:'Charizard', set:'Base Set', number:'4', condition:'LP', quantity:1, prices:{cardmarket:{avg30:200,lowest:150,currency:'EUR'}}, buyPrice:60, forTrade:true, addedAt:Date.now() },
];
await db.doc(`collections/${uid}`).set({ items:cards, currency:'EUR', marketSource:'cardmarket',shareEnabled:true });
await db.doc(`collector_collections/${uid}`).set({ items:cards, currency:'EUR', marketSource:'cardmarket',shareEnabled:true });
await db.doc(`collector_wishlists/${uid}`).set({ items:[cards[0]] });
await syncPublicUser(db,uid); await syncWishlist(db,uid);
console.log('Seeded local demo account and sample cards.');
await db.terminate();
