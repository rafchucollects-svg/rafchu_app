/**
 * Seed Script for Firebase Emulators
 * Run this to populate test data for development
 * 
 * Usage:
 *   1. Start emulators: firebase emulators:start
 *   2. Run this script: node scripts/seed-emulator-data.js
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  updateProfile,
  connectAuthEmulator 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  addDoc,
  serverTimestamp,
  connectFirestoreEmulator 
} from 'firebase/firestore';

// Firebase config (same as production, but will connect to emulators)
const firebaseConfig = {
  apiKey: "AIzaSyD9sA1Vz3Cmw28kkvaEs1SaTucJY1SvNTQ",
  authDomain: "rafchu-tcg-app.firebaseapp.com",
  projectId: "rafchu-tcg-app",
  storageBucket: "rafchu-tcg-app.firebasestorage.app",
  messagingSenderId: "1045008710585",
  appId: "1:1045008710585:web:bafe104ec40fdaf3e71468",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Connect to emulators
connectAuthEmulator(auth, "http://localhost:9099");
connectFirestoreEmulator(db, "localhost", 8080);

console.log('🌱 Seeding Firebase Emulator Data...\n');

// Test users
const testUsers = [
  {
    email: 'collector@test.com',
    password: 'password123',
    displayName: 'Test Collector',
    profile: {
      isVendor: false,
      location: 'Miami, FL',
      marketSource: 'tcgplayer'
    }
  },
  {
    email: 'vendor@test.com',
    password: 'password123',
    displayName: 'Test Vendor',
    profile: {
      isVendor: true,
      vendorAccess: {
        enabled: true,
        tier: 'pro',
        status: 'active',
        grantedAt: new Date().toISOString(),
        grantedBy: 'rafchucollects@gmail.com'
      },
      businessName: 'Test TCG Shop',
      location: 'Miami, FL',
      marketSource: 'tcgplayer',
      defaultBuyPercentage: 60,
      defaultTradePercentage: 80,
      defaultSellPercentage: 100,
      instagram: '@testtcgshop',
      youtube: '@TestTCGShop'
    }
  },
  {
    email: 'admin@test.com',
    password: 'password123',
    displayName: 'Test Admin',
    profile: {
      isVendor: false,
      location: 'Miami, FL',
      marketSource: 'tcgplayer'
    }
  }
];

// Test cards for collection/inventory
const testCards = [
  {
    name: 'Charizard',
    set: 'Base Set',
    number: '4',
    rarity: 'Holo Rare',
    tcgPlayerId: '4280',
    imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/4280_in_600x600.jpg',
    marketPrice: 180.00,
    // Variant support (NEW in v2.1)
    variant: '1st Edition',
    variantType: 'edition',
    variantSource: 'user-specified'
  },
  {
    name: 'Pikachu VMAX',
    set: 'Vivid Voltage',
    number: '044',
    rarity: 'Ultra Rare',
    tcgPlayerId: '197534',
    imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/197534_in_600x600.jpg',
    marketPrice: 15.00,
    // Graded card (NEW in v2.1)
    isGraded: true,
    gradingCompany: 'PSA',
    grade: 10,
    gradedPrice: 150.00
  },
  {
    name: 'Gengar',
    set: 'Legendary Collection',
    number: '11',
    rarity: 'Holo Rare',
    tcgPlayerId: '85670',
    imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/85670_in_600x600.jpg',
    marketPrice: 169.99,
    // Regular variant
    variant: 'Holofoil',
    variantType: 'holo',
    variantSource: 'user-specified'
  },
  {
    name: 'Pikachu',
    set: 'Japanese Promo',
    number: '001',
    rarity: 'Promo',
    marketPrice: 25.00,
    // Japanese card (NEW in v2.1)
    language: 'Japanese',
    isJapanese: true,
    manualPrice: 25.00
  }
];

async function seed() {
  try {
    console.log('📝 Creating test users...\n');
    
    for (const testUser of testUsers) {
      try {
        // Create user account
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          testUser.email,
          testUser.password
        );
        
        const user = userCredential.user;
        
        // Update display name
        await updateProfile(user, {
          displayName: testUser.displayName
        });
        
        // Create user profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          ...testUser.profile,
          displayName: testUser.displayName,
          email: testUser.email,
          createdAt: serverTimestamp(),
        });
        
        console.log(`✅ Created user: ${testUser.email} (${testUser.displayName})`);
        
        // Add collection items for collector
        if (!testUser.profile.isVendor) {
          const collectionRef = collection(db, `users/${user.uid}/collection`);
          for (const card of testCards.slice(0, 2)) {
            await addDoc(collectionRef, {
              ...card,
              quantity: 1,
              condition: 'NM',
              addedAt: serverTimestamp(),
            });
          }
          console.log(`   Added ${2} cards to collection`);
        }
        
        // Add inventory items for vendor
        if (testUser.profile.isVendor) {
          const inventoryRef = collection(db, `users/${user.uid}/collection`);
          for (const card of testCards) {
            await addDoc(inventoryRef, {
              ...card,
              quantity: Math.floor(Math.random() * 5) + 1,
              condition: 'NM',
              buyPrice: card.marketPrice * 0.6,
              tradePrice: card.marketPrice * 0.8,
              sellPrice: card.marketPrice,
              addedAt: serverTimestamp(),
            });
          }
          console.log(`   Added ${testCards.length} cards to inventory`);
        }
        
        // Add wishlist items
        const wishlistRef = collection(db, `users/${user.uid}/wishlist`);
        await addDoc(wishlistRef, {
          ...testCards[2],
          addedAt: serverTimestamp(),
        });
        console.log(`   Added 1 card to wishlist`);
        
      } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
          console.log(`⏭️  User already exists: ${testUser.email}`);
        } else {
          console.error(`❌ Error creating user ${testUser.email}:`, error.message);
        }
      }
    }
    
    console.log('\n✅ Seeding complete!');
    console.log('\n📋 Test Accounts:');
    console.log('   Collector: collector@test.com / password123');
    console.log('   Vendor:    vendor@test.com / password123');
    console.log('   Admin:     admin@test.com / password123');
    console.log('\n🚀 Start your dev server: npm run dev');
    console.log('🔧 Access emulator UI: http://localhost:4000');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();










