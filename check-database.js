import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf-8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkDatabase() {
  console.log('\n🔍 Checking card_database collection...\n');
  
  try {
    // Get total count
    const snapshot = await db.collection('card_database').limit(10).get();
    
    console.log(`📊 Found ${snapshot.size} cards (showing first 10):\n`);
    
    snapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. ${data.name}`);
      console.log(`   Set: ${data.set || 'N/A'}`);
      console.log(`   Number: ${data.number || 'N/A'}`);
      console.log(`   Image: ${data.image ? '✅' : '❌'}`);
      console.log(`   Market Price: $${data.prices?.market || 'N/A'}`);
      console.log(`   TCGPlayer: $${data.prices?.tcgplayer?.market || 'N/A'}`);
      console.log(`   CardMarket: $${data.prices?.cardmarket?.trendPrice || 'N/A'}`);
      console.log(`   Last Updated: ${data.lastUpdated?.toDate().toLocaleString() || 'N/A'}`);
      console.log(`   Search Terms: ${data.searchTerms?.slice(0, 5).join(', ') || 'N/A'}...`);
      console.log('');
    });
    
    // Check for community images
    console.log('\n🖼️ Checking community_images collection...\n');
    const communityImages = await db.collection('community_images').limit(5).get();
    console.log(`Found ${communityImages.size} community images\n`);
    
    communityImages.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. ${data.cardName} (${data.cardSet} #${data.cardNumber})`);
      console.log(`   Status: ${data.status}`);
      console.log(`   URL: ${data.imageUrl}`);
      console.log('');
    });
    
    // Check update logs
    console.log('\n📝 Checking update_logs collection...\n');
    const logs = await db.collection('update_logs').orderBy('timestamp', 'desc').limit(3).get();
    console.log(`Found ${logs.size} log entries (showing latest 3)\n`);
    
    logs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. ${data.type} - ${data.status}`);
      console.log(`   Time: ${data.timestamp?.toDate().toLocaleString() || 'N/A'}`);
      console.log(`   Duration: ${data.duration || 'N/A'}s`);
      if (data.stats) {
        console.log(`   Stats: ${JSON.stringify(data.stats)}`);
      }
      if (data.error) {
        console.log(`   Error: ${data.error}`);
      }
      console.log('');
    });
    
    console.log('✅ Database check complete!\n');
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  }
  
  process.exit(0);
}

checkDatabase();

