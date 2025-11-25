const admin = require('firebase-admin');
const serviceAccount = require('./rafchu-tcg-app-firebase-adminsdk-p55k5-6f8e22c5b2.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkRoundUp() {
  // Get all vendor collections
  const collections = await db.collection('collections').get();
  
  console.log('Checking roundUp field in vendor collections:\n');
  
  collections.docs.forEach(doc => {
    const data = doc.data();
    const roundUp = data.roundUp;
    const itemCount = data.items?.length || 0;
    
    console.log(`Vendor: ${doc.id}`);
    console.log(`  - roundUp: ${roundUp}`);
    console.log(`  - Items: ${itemCount}`);
    console.log('');
  });
  
  process.exit(0);
}

checkRoundUp().catch(console.error);
