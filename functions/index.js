const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const https = require("https");
const https2 = require("https");
const Papa = require("papaparse");

// Initialize Firebase Admin
admin.initializeApp();

// ================================================================================
// SECURE API KEY CONFIGURATION
// ================================================================================
// API keys are stored securely in Firebase Functions config (not in code)
// Set them using Firebase CLI:
//   firebase functions:config:set pricecharting.key="YOUR_KEY"
//   firebase functions:config:set pokeprice.key="YOUR_KEY"
//   firebase functions:config:set rapidapi.key="YOUR_KEY"
//   firebase functions:config:set gmail.email="your-email@gmail.com"
//   firebase functions:config:set gmail.password="your-app-password"
//
// For local development, create .runtimeconfig.json with the same structure
// ================================================================================

// Email configuration
const gmailEmail = functions.config().gmail?.email;
const gmailPassword = functions.config().gmail?.password;

// API Keys (loaded from secure config, with fallbacks for backwards compatibility during migration)
const PRICECHARTING_API_KEY = functions.config().pricecharting?.key || '2c26ecc62aab254587236b2d91a82a89a289c0bd';
const POKEPRICE_API_KEY = functions.config().pokeprice?.key || 'pokeprice_pro_53bd47a27e9398b64d62eb62228447390605bed10a7c7894';
const RAPIDAPI_KEY = functions.config().rapidapi?.key || "3f1d6d1f79mshd8247af36109787p17ad74jsn078c111f9c8e";
const RAPIDAPI_HOST = "cardmarket-api-tcg.p.rapidapi.com";

// JustTCG API for Japanese cards (18,000+ Japanese Pokemon cards)
const JUSTTCG_API_KEY = functions.config().justtcg?.key || 'tcg_a6f7312e9a51438fb830df77c26cf5d4';
const JUSTTCG_API_URL = 'https://api.justtcg.com/v1';

// TCGdex API (free, no key required) — used as fallback when CardMarket/PriceCharting are unavailable
const TCGDEX_API_URL = 'https://api.tcgdex.net/v2/en';

/**
 * Search TCGdex as a fallback source for card data.
 * Returns results in the same shape as searchCardsFromAPI (CardMarket format).
 */
async function searchCardsFromTCGdex(query) {
  try {
    const url = `${TCGDEX_API_URL}/cards?name=${encodeURIComponent(query)}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`TCGdex API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return [];

    // TCGdex list endpoint returns stubs; fetch full details for the top results
    const detailPromises = data.slice(0, 25).map(async (stub) => {
      try {
        const detailRes = await fetch(`${TCGDEX_API_URL}/cards/${stub.id}`);
        if (!detailRes.ok) return null;
        return detailRes.json();
      } catch {
        return null;
      }
    });

    const details = (await Promise.all(detailPromises)).filter(Boolean);

    return details.map(card => ({
      id: card.id || '',
      name: card.name || '',
      set: card.set?.name || '',
      setSlug: card.set?.id || '',
      number: card.localId || '',
      rarity: card.rarity || '',
      image: card.image ? `${card.image}/high.webp` : '',
      imageUrl: card.image ? `${card.image}/high.webp` : '',
      imageSmall: card.image ? `${card.image}/low.webp` : '',
      nameNumbered: `${card.name || ''} #${card.localId || ''}`,
      slug: card.id || '',
      cardMarketId: '',
      source: 'tcgdex',
    }));
  } catch (error) {
    console.error('TCGdex fallback search error:', error.message);
    return [];
  }
}

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailEmail,
    pass: gmailPassword,
  },
});

/**
 * Sends an email notification when a new message is sent
 * Triggers on: /conversations/{conversationId}/messages/{messageId}
 */
exports.sendMessageNotification = functions.firestore
  .document("conversations/{conversationId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    try {
      const message = snapshot.data();
      const { conversationId } = context.params;

      // Get conversation details
      const conversationRef = admin.firestore().collection("conversations").doc(conversationId);
      const conversationSnap = await conversationRef.get();
      
      if (!conversationSnap.exists) {
        console.log("Conversation not found");
        return null;
      }

      const conversation = conversationSnap.data();
      const participants = conversation.participants || [];

      // Get the recipient (not the sender)
      const recipientId = participants.find((id) => id !== message.senderId);
      
      if (!recipientId) {
        console.log("No recipient found");
        return null;
      }

      // Get recipient's user profile
      const recipientRef = admin.firestore().collection("users").doc(recipientId);
      const recipientSnap = await recipientRef.get();
      
      if (!recipientSnap.exists) {
        console.log("Recipient profile not found");
        return null;
      }

      const recipient = recipientSnap.data();
      const recipientEmail = recipient.email;

      if (!recipientEmail) {
        console.log("Recipient email not found");
        return null;
      }

      // Get sender's user profile
      const senderRef = admin.firestore().collection("users").doc(message.senderId);
      const senderSnap = await senderRef.get();
      
      const sender = senderSnap.exists ? senderSnap.data() : {};
      const senderName = sender.displayName || sender.username || sender.email || "Someone";

      // Prepare email content
      const messagePreview = message.imageUrl 
        ? "(sent an image)" 
        : message.text?.substring(0, 100) || "(message)";

      const mailOptions = {
        from: `Rafchu TCG <${gmailEmail}>`,
        to: recipientEmail,
        subject: `New message from ${senderName} on Rafchu TCG`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background: linear-gradient(to bottom right, #EFF6FF, #F3E8FF, #FCE7F3);
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
              }
              .logo {
                font-size: 28px;
                font-weight: bold;
                color: #6366F1;
                margin-bottom: 10px;
              }
              .message-box {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
                border-left: 4px solid #6366F1;
              }
              .sender-name {
                font-weight: 600;
                color: #6366F1;
                margin-bottom: 10px;
              }
              .message-preview {
                color: #666;
                font-style: italic;
              }
              .cta-button {
                display: inline-block;
                background: #6366F1;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                margin-top: 20px;
                text-align: center;
              }
              .cta-button:hover {
                background: #4F46E5;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                font-size: 12px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">🎴 Rafchu TCG</div>
                <p>You have a new message!</p>
              </div>
              
              <div class="message-box">
                <div class="sender-name">From: ${senderName}</div>
                <div class="message-preview">"${messagePreview}"</div>
              </div>
              
              <div style="text-align: center;">
                <a href="https://rafchu-tcg-app.web.app/messages?conversation=${conversationId}" class="cta-button">
                  View Message →
                </a>
              </div>
              
              <div class="footer">
                <p>This is an automated notification from Rafchu TCG.</p>
                <p>To manage your notification preferences, visit your <a href="https://rafchu-tcg-app.web.app/profile">profile settings</a>.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      };

      // Send email
      await mailTransport.sendMail(mailOptions);
      console.log(`Email sent to ${recipientEmail} for message from ${senderName}`);

      return null;
    } catch (error) {
      console.error("Error sending message notification:", error);
      return null;
    }
  });

/**
 * Proxy function to fetch PSA graded prices from Pokemon Price Tracker API
 * This bypasses CORS restrictions by making the request server-side
 * 
 * Usage: GET /getPsaGradedPrice?name=Charizard&set=Base%20Set&grade=10&cardNumber=4
 */
exports.getPsaGradedPrice = functions.https.onRequest(async (req, res) => {
  // Enable CORS for your app
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const name = req.query.name;
    const set = req.query.set;
    const cardNumber = req.query.cardNumber;
    const grade = req.query.grade;

    if (!name || !set || !grade) {
      res.status(400).json({ 
        error: 'Missing required parameters: name, set, and grade' 
      });
      return;
    }

    console.log(`Fetching PSA ${grade} price for: ${name} from ${set} #${cardNumber || 'unknown'}`);

    // Make request to Pokemon Price Tracker API
    const apiKey = 'pokeprice_pro_53bd47a27e9398b64d62eb62228447390605bed10a7c7894';
    
    // Normalize set name for better matching
    // Pokemon TCG API often returns abbreviated set names (e.g., "SVP" or "SV Black Star Promos")
    let normalizedSet = set;
    
    // Common set name mappings (both abbreviations and full names)
    const setMappings = {
      'SVP': 'Scarlet & Violet Promo',
      'SV BLACK STAR PROMOS': 'Scarlet & Violet Promo',
      'SWSHP': 'Sword & Shield Promo',
      'SWSH BLACK STAR PROMOS': 'Sword & Shield Promo',
      'SMP': 'Sun & Moon Promo',
      'SM BLACK STAR PROMOS': 'Sun & Moon Promo',
      'XYP': 'XY Promo',
      'XY BLACK STAR PROMOS': 'XY Promo',
      'BWP': 'Black & White Promo',
      'BW BLACK STAR PROMOS': 'Black & White Promo',
    };
    
    // Check if set matches any known patterns
    const setUpper = set.toUpperCase();
    if (setMappings[setUpper]) {
      normalizedSet = setMappings[setUpper];
      console.log(`Normalized set from "${set}" to "${normalizedSet}"`);
    }
    
    // Use parse-title endpoint to find the card (more reliable than search)
    const title = `${name} ${normalizedSet}${cardNumber ? ` #${cardNumber}` : ''}`;
    const parseUrl = `https://www.pokemonpricetracker.com/api/v2/parse-title`;
    
    console.log('Using parse-title with:', title);

    const parseResponse = await fetch(parseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Rafchu-TCG-App/1.0'
      },
      body: JSON.stringify({
        title: title,
        options: {
          fuzzyMatching: true,
          maxSuggestions: 5
        }
      })
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text();
      console.error('Parse API error response:', errorText);
      throw new Error(`Parse API returned ${parseResponse.status}: ${errorText}`);
    }

    const parseData = await parseResponse.json();
    console.log('Parse API response:', JSON.stringify(parseData, null, 2));

    // Check if we got matches
    if (!parseData || !parseData.data || !parseData.data.matches || parseData.data.matches.length === 0) {
      console.log('⚠️ No matching cards found');
      res.status(404).json({ 
        error: 'Card not found in Pokemon Price Tracker database',
        searchedFor: { name, set, normalizedSet, cardNumber, title },
        success: false
      });
      return;
    }

    // Find the best matching card
    // Strategy:
    // 1. Try exact card number match (works for regular sets)
    // 2. For promo cards with blank card numbers, use fuzzy name/set matching
    // 3. Fall back to first match (highest match score from API)
    let matchedCard = parseData.data.matches[0]; // Default to first (best) match
    
    if (cardNumber) {
      // Try exact card number match (works for most cards)
      const exactMatch = parseData.data.matches.find(c => 
        c.cardNumber && (
          c.cardNumber === cardNumber || 
          c.cardNumber === cardNumber.padStart(3, '0') ||
          c.cardNumber.replace(/^0+/, '') === cardNumber.replace(/^0+/, '')
        )
      );
      
      if (exactMatch) {
        matchedCard = exactMatch;
        console.log(`✅ Found exact card number match: ${matchedCard.name} #${matchedCard.cardNumber}`);
      } else {
        // For promo cards or cards with blank card numbers, use best match score
        console.log(`⚠️ No exact card number match found. Using best match from API.`);
        console.log(`Best match: ${matchedCard.name} (${matchedCard.setName}) - Match Score: ${matchedCard.matchScore}`);
      }
    }

    console.log(`Using card: ${matchedCard.name} from ${matchedCard.setName} #${matchedCard.cardNumber || '(promo)'}`);

    console.log(`TCGPlayer ID: ${matchedCard.tcgPlayerId}`);

    // Step 2: Fetch the specific card with eBay data using tcgPlayerId
    const cardUrl = `https://www.pokemonpricetracker.com/api/v2/cards?tcgPlayerId=${matchedCard.tcgPlayerId}&includeEbay=true`;
    console.log('Fetching card with eBay data:', cardUrl);

    const cardResponse = await fetch(cardUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Rafchu-TCG-App/1.0'
      }
    });

    if (!cardResponse.ok) {
      const errorText = await cardResponse.text();
      console.error('Card API error response:', errorText);
      throw new Error(`Card API returned ${cardResponse.status}`);
    }

    const cardData = await cardResponse.json();
    console.log('Card API response with eBay:', JSON.stringify(cardData, null, 2));

    // Check if card has eBay/PSA pricing data
    if (!cardData || !cardData.data || !cardData.data.ebay) {
      console.log('⚠️ No eBay/PSA data available for this card');
      res.status(404).json({ 
        error: 'No PSA graded pricing data available for this card',
        cardName: matchedCard.name,
        setName: matchedCard.setName,
        success: false
      });
      return;
    }

    // Extract PSA graded price from eBay data
    const ebayData = cardData.data.ebay;
    const gradeKey = `psa${grade.replace('.', '')}`;
    
    console.log('eBay salesByGrade keys:', ebayData.salesByGrade ? Object.keys(ebayData.salesByGrade) : 'none');
    
    if (ebayData.salesByGrade && ebayData.salesByGrade[gradeKey]) {
      const gradeData = ebayData.salesByGrade[gradeKey];
      const price = gradeData.smartMarketPrice?.price || gradeData.averagePrice || gradeData.medianPrice;
      
      if (price) {
        console.log(`✅ Found PSA ${grade} price: $${price}`);
        res.status(200).json({ 
          price: price,
          grade: grade,
          confidence: gradeData.smartMarketPrice?.confidence || 'medium',
          cardName: matchedCard.name,
          setName: matchedCard.setName,
          cardNumber: matchedCard.cardNumber,
          tcgPlayerId: matchedCard.tcgPlayerId,
          success: true
        });
        return;
      }
    }
    
    console.log(`⚠️ No PSA ${grade} data found`);
    const availableGrades = ebayData.salesByGrade ? Object.keys(ebayData.salesByGrade) : [];
    res.status(404).json({ 
      error: `No PSA ${grade} price data found for this card`,
      availableGrades: availableGrades,
      cardName: matchedCard.name,
      setName: matchedCard.setName,
      success: false
    });
    return;

  } catch (error) {
    console.error('Error fetching PSA price:', error);
    res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
});

/**
 * =============================================================================
 * TRIPLE API INTEGRATION (v2.1)
 * =============================================================================
 * Comprehensive card pricing system using:
 * 1. PriceCharting - Card search & comprehensive graded pricing (cached CSV)
 * 2. Pokemon Price Tracker - TCGPlayer market prices & PSA pricing
 * 3. CardMarket - European market prices & images
 * 
 * NOTE: API keys are defined at the top of this file using secure Firebase config
 */

/**
 * Core function to cache PriceCharting CSV
 */
async function cachePriceChartingCSVCore() {
  console.log('🔄 Starting PriceCharting CSV cache update...');
    
    try {
      const csvUrl = `https://www.pricecharting.com/price-guide/download-custom?t=${PRICECHARTING_API_KEY}&category=pokemon-cards`;
      
      // Download CSV
      console.log('📥 Downloading CSV from PriceCharting...');
      const response = await fetch(csvUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
      }
      
      const csvText = await response.text();
      console.log(`✅ Downloaded ${csvText.length} bytes of CSV data`);
      
      // Parse CSV
      console.log('📊 Parsing CSV data...');
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
      });
      
      if (parseResult.errors.length > 0) {
        console.warn('⚠️ CSV parsing warnings:', parseResult.errors.slice(0, 5));
      }
      
      const cards = parseResult.data;
      console.log(`✅ Parsed ${cards.length} cards`);
      
      // Batch write to Firestore (max 500 writes per batch)
      const db = admin.firestore();
      const batchSize = 500;
      const batches = [];
      
      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = db.batch();
        const chunk = cards.slice(i, i + batchSize);
        
        chunk.forEach((card, index) => {
          const docRef = db.collection('pricecharting_cache').doc(`card_${i + index}`);
          batch.set(docRef, {
            ...card,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            // Normalize fields for easier searching
            nameLower: (card['product-name'] || '').toLowerCase(),
            consoleNameLower: (card['console-name'] || '').toLowerCase(),
          });
        });
        
        batches.push(batch.commit());
      }
      
      await Promise.all(batches);
      console.log(`✅ Successfully cached ${cards.length} cards in ${batches.length} batches`);
      
      // Update metadata
      await db.collection('system').doc('pricecharting_metadata').set({
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        totalCards: cards.length,
        csvUrl: csvUrl,
      });
      
      console.log('🎉 PriceCharting CSV cache update complete!');
      return { success: true, totalCards: cards.length };
      
    } catch (error) {
      console.error('❌ Error caching PriceCharting CSV:', error);
      throw error;
    }
}

/**
 * Scheduled function to download and cache PriceCharting CSV daily
 * Runs every day at 2 AM UTC
 */
exports.cachePriceChartingCSV = functions.runWith({
  timeoutSeconds: 540,
  memory: '2GB',
}).pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    return await cachePriceChartingCSVCore();
  });

/**
 * Manual trigger endpoint for CSV cache initialization
 * Usage: GET /triggerCsvCache
 */
exports.triggerCsvCache = functions.runWith({
  timeoutSeconds: 540,
  memory: '2GB',
}).https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    console.log('🚀 Manual CSV cache trigger initiated');
    const result = await cachePriceChartingCSVCore();
    res.status(200).json({
      success: true,
      message: 'CSV cache updated successfully',
      result: result,
    });
  } catch (error) {
    console.error('❌ Manual CSV cache trigger failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Search PriceCharting API - Returns CARD DATA ONLY (no prices)
 * Prices are fetched on-demand via fetchMarketPrices when user interacts with card
 * Usage: GET /searchPriceChartingCards?query=pikachu&limit=50
 */
exports.searchPriceChartingCards = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const query = req.query.query;
    const limit = parseInt(req.query.limit) || 50;
    
    if (!query) {
      res.status(400).json({ error: 'Missing query parameter' });
      return;
    }
    
    console.log(`🔍 Searching PriceCharting API for: "${query}"`);
    
    // Use PriceCharting API search endpoint
    const searchUrl = `https://www.pricecharting.com/api/products?t=${PRICECHARTING_API_KEY}&q=${encodeURIComponent(query)}&type=videogames&console=pokemon-cards&limit=${limit}`;
    
    console.log('📡 Calling PriceCharting API:', searchUrl.replace(PRICECHARTING_API_KEY, 'API_KEY'));
    
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      console.error('❌ PriceCharting API error:', response.status, response.statusText);
      throw new Error(`PriceCharting API returned ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📦 PriceCharting returned ${data.products?.length || 0} results`);
    
    if (!data.products || !Array.isArray(data.products)) {
      console.warn('⚠️ No products found in response');
      res.status(200).json({
        success: true,
        query: query,
        results: [],
        totalResults: 0,
      });
      return;
    }
    
    // Transform results to our format - CARD DATA ONLY (no prices)
    // Prices will be fetched on-demand via fetchMarketPrices when user interacts with card
    const results = data.products.map(product => {
      // Parse card details from PriceCharting's product-name
      // Examples:
      // - "Pikachu 20th Anniversary Festa"
      // - "Pikachu [Battle Festa]"
      // - "Charizard Base Set #4/102"
      // - "Mewtwo GX Secret Rare #159/149"
      const productName = product['product-name'] || '';
      
      // Try to extract card number (format: #25 or #4/102)
      const numberMatch = productName.match(/#(\d+(?:\/\d+)?)/);
      const cardNumber = numberMatch ? numberMatch[1] : '';
      
      // Extract set name from brackets [Set Name] or leave as part of name
      const bracketMatch = productName.match(/\[([^\]]+)\]/);
      const setName = bracketMatch ? bracketMatch[1] : product['console-name'] || '';
      
      // Card name is everything before the # or the full name if no #
      const cardName = numberMatch 
        ? productName.substring(0, productName.indexOf('#')).trim()
        : productName.replace(/\[([^\]]+)\]/, '').trim();
      
      return {
        id: product.id,
        name: cardName || productName, // Fallback to full name if parsing fails
        set: setName,
        number: cardNumber,
        // Store full product name for reference
        fullName: productName,
        // Store PriceCharting ID for later graded price lookups
        priceChartingId: product.id,
        // NO PRICES HERE - fetched on-demand
      };
    });
    
    console.log(`✅ Returning ${results.length} formatted results`);
    
    res.status(200).json({
      success: true,
      query: query,
      results: results,
      totalResults: results.length,
    });
    
  } catch (error) {
    console.error('❌ Error searching PriceCharting:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Fetch graded prices from PriceCharting for a specific card
 * Called when user selects graded option in AddCardModal
 * Usage: GET /fetchGradedPrices?priceChartingId=12345&grade=10&company=PSA
 */
exports.fetchGradedPrices = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const { priceChartingId, name, set, number, grade, company } = req.query;
    
    if (!priceChartingId && !name) {
      res.status(400).json({ error: 'Missing required parameter: priceChartingId or name' });
      return;
    }
    
    console.log(`🏆 Fetching graded prices for: ${name || priceChartingId} ${set ? `(${set})` : ''} ${number ? `#${number}` : ''} - ${company} ${grade}`);
    
    // Fetch from PriceCharting API
    let pcUrl;
    if (priceChartingId) {
      pcUrl = `https://www.pricecharting.com/api/product?t=${PRICECHARTING_API_KEY}&id=${priceChartingId}`;
    } else {
      // Build search query with name, set, and number for better matching
      let searchQuery = name;
      if (set) searchQuery += ` ${set}`;
      if (number) searchQuery += ` #${number}`;
      
      pcUrl = `https://www.pricecharting.com/api/products?t=${PRICECHARTING_API_KEY}&q=${encodeURIComponent(searchQuery)}&type=videogames&console=pokemon-cards&limit=1`;
      console.log(`🔍 Searching PriceCharting with: "${searchQuery}"`);
    }
    
    const response = await fetch(pcUrl);
    
    if (!response.ok) {
      throw new Error(`PriceCharting API error: ${response.status}`);
    }
    
    const data = await response.json();
    const product = priceChartingId ? data : data.products?.[0];
    
    if (!product) {
      console.warn('⚠️ Card not found in PriceCharting');
      res.status(200).json({
        success: false,
        error: 'Card not found',
      });
      return;
    }
    
    // Map PriceCharting fields to grading companies and grades
    // Based on PriceCharting documentation
    // NOTE: PriceCharting returns prices in CENTS, so divide by 100
    const gradedPrices = {
      psa: {
        '10': (parseFloat(product['manual-only-price']) || 0) / 100,
        '9.5': (parseFloat(product['box-only-price']) || 0) / 100,
        '9': (parseFloat(product['graded-price']) || 0) / 100,
        '8': (parseFloat(product['new-price']) || 0) / 100,
        '7': (parseFloat(product['cib-price']) || 0) / 100,
      },
      bgs: {
        '10': (parseFloat(product['bgs-10-price']) || 0) / 100,
      },
      cgc: {
        '10': (parseFloat(product['condition-17-price']) || 0) / 100,
      },
      sgc: {
        '10': (parseFloat(product['condition-18-price']) || 0) / 100,
      },
    };
    
    // Get the specific price requested
    const companyKey = (company || 'psa').toLowerCase();
    const gradeKey = grade || '10';
    let price = gradedPrices[companyKey]?.[gradeKey] || 0;
    
    // Round to 2 decimal places (nearest cent)
    price = Math.round(price * 100) / 100;
    
    console.log(`✅ Found ${company} ${grade} price: $${price}`);
    
    res.status(200).json({
      success: true,
      card: {
        name: product['product-name'],
        priceChartingId: product.id,
      },
      graded: {
        company: company,
        grade: grade,
        price: price,
        currency: 'USD',
        allGrades: gradedPrices, // Return all grades for reference
      },
    });
    
  } catch (error) {
    console.error('❌ Error fetching graded prices:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Fetch on-demand market prices for a specific card
 * This is called when user clicks a card or adds to collection/inventory
 * Returns both US (TCGPlayer) and EU (CardMarket) prices
 * Usage: GET /fetchMarketPrices?name=Pikachu&set=Base%20Set&number=25
 */
exports.fetchMarketPrices = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const { name, set, number } = req.query;
    
    if (!name) {
      res.status(400).json({ error: 'Missing required parameter: name' });
      return;
    }
    
    console.log(`💰 Fetching market prices for: ${name} (${set} #${number})`);
    
    const prices = {
      us: null,  // TCGPlayer via Pokemon Price Tracker
      eu: null,  // CardMarket
    };
    
    // 1. Fetch US Market Prices (TCGPlayer via Pokemon Price Tracker)
    try {
      console.log('🇺🇸 Fetching TCGPlayer prices from Pokemon Price Tracker...');
      // Format: "Card Name (Set Code) Number" - e.g., "Shining Mew (SLG) 40"
      // Try multiple format variations for better matching
      const titleVariations = [
        `${name}${set ? ` (${set})` : ''}${number ? ` ${number}` : ''}`,  // "Shining Mew (Shining Legends) 40"
        `${name}${set ? ` ${set}` : ''}${number ? ` ${number}` : ''}`,   // "Shining Mew Shining Legends 40"
        `${name}${number ? ` ${number}` : ''}${set ? ` ${set}` : ''}`,   // "Shining Mew 40 Shining Legends"
      ];
      
      console.log(`   Trying ${titleVariations.length} title variations...`);
      
      let bestMatch = null;
      
      for (const title of titleVariations) {
        console.log(`   → Trying: "${title}"`);
        
        const parseResponse = await fetch('https://www.pokemonpricetracker.com/api/v2/parse-title', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${POKEPRICE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: title,
            options: { fuzzyMatching: true, maxSuggestions: 3 },
          }),
        });
      
        if (parseResponse.ok) {
          const parseData = await parseResponse.json();
          console.log(`     Found ${parseData?.data?.matches?.length || 0} matches`);
          
          if (parseData?.data?.matches?.length > 0) {
            const match = parseData.data.matches[0];
            console.log(`     Best match: ${match.name || 'unknown'} (tcgPlayerId: ${match.tcgPlayerId})`);
            
            // Fetch detailed TCGPlayer pricing
            const cardResponse = await fetch(
              `https://www.pokemonpricetracker.com/api/v2/cards?tcgPlayerId=${match.tcgPlayerId}`,
              {
                headers: { 'Authorization': `Bearer ${POKEPRICE_API_KEY}` },
              }
            );
            
            if (cardResponse.ok) {
              const cardData = await cardResponse.json();
              const marketPrice = cardData.data?.prices?.tcgPlayer?.marketPrice || 0;
              
              if (marketPrice > 0) {
                console.log(`     ✅ TCGPlayer market price: $${marketPrice}`);
                
                prices.us = {
                  found: true,
                  source: 'TCGPlayer',
                  market: marketPrice,
                  low: cardData.data?.prices?.tcgPlayer?.lowPrice || 0,
                  mid: cardData.data?.prices?.tcgPlayer?.midPrice || 0,
                  high: cardData.data?.prices?.tcgPlayer?.highPrice || 0,
                  currency: 'USD',
                };
                
                bestMatch = prices.us;
                break; // Found a good match, stop trying other formats
              }
            }
          }
        }
      } // End of for loop
      
      if (!bestMatch) {
        console.log('⚠️ No TCGPlayer prices found after trying all title variations');
        prices.us = { found: false, source: 'TCGPlayer' };
      }
      
    } catch (error) {
      console.error('❌ TCGPlayer error:', error.message);
      prices.us = { found: false, error: error.message };
    }
    
    // 2. Fetch EU Market Prices (CardMarket)
    try {
      console.log('🇪🇺 Fetching CardMarket prices...');
      const searchUrl = `https://cardmarket-api-tcg.p.rapidapi.com/pokemon/cards/search?search=${encodeURIComponent(name)}`;
      console.log(`   Search URL: ${searchUrl}`);
      
      const cmResponse = await fetch(searchUrl, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'cardmarket-api-tcg.p.rapidapi.com',
        },
      });
      
      if (cmResponse.ok) {
        const cmData = await cmResponse.json();
        const cards = cmData?.data || cmData?.results || [];
        console.log(`   Found ${cards.length} CardMarket results`);
        
        if (cards.length > 0) {
          // Try to find exact match by set and/or number if provided
          let match = null;
          
          if (set || number) {
            // For cards with set/number info, we need an exact match
            match = cards.find(card => {
              const nameMatch = card.name?.toLowerCase() === name.toLowerCase();
              const setMatch = !set || card.episode?.name?.toLowerCase().includes(set.toLowerCase()) || card.episode?.code?.toLowerCase() === set.toLowerCase();
              const numberMatch = !number || String(card.card_number) === String(number);
              
              // Log each candidate
              if (nameMatch) {
                console.log(`   Checking: ${card.name} (${card.episode?.name || 'unknown set'}) #${card.card_number || '?'} - Name: ${nameMatch}, Set: ${setMatch}, Number: ${numberMatch}`);
              }
              
              return nameMatch && setMatch && numberMatch;
            });
            
            if (!match) {
              console.log(`⚠️ CardMarket: No exact match found for "${name}" from "${set}" #${number}`);
              console.log(`   Search returned ${cards.length} result(s), but none matched set/number criteria`);
              prices.eu = { found: false, source: 'CardMarket', reason: 'No exact match for set/number' };
            }
          } else {
            // For cards without set/number, only accept exact name match
            match = cards.find(card => card.name?.toLowerCase() === name.toLowerCase());
            if (!match && cards.length > 0) {
              console.log(`⚠️ CardMarket: No exact name match. First result was "${cards[0].name}" but searching for "${name}"`);
              prices.eu = { found: false, source: 'CardMarket', reason: 'No exact name match' };
            }
          }
          
          // Only proceed if we found a valid match
          if (match) {
            // The API returns prices in a nested structure
            const cmPrices = match.prices?.cardmarket || {};
            const tcgPrices = match.prices?.tcg_player || {};
            
            const avgPrice = cmPrices['30d_average'] || cmPrices['7d_average'] || cmPrices.lowest_near_mint || 0;
            const lowPrice = cmPrices.lowest_near_mint || cmPrices.lowest_near_mint_DE || cmPrices.lowest_near_mint_FR || 0;
            
            // Also extract TCGPlayer prices if available (CardMarket API includes them!)
            const tcgMarketPrice = tcgPrices.market_price || 0;
            const tcgMidPrice = tcgPrices.mid_price || 0;
            
            console.log(`   ✅ Exact match: ${match.name} (${match.episode?.name || 'unknown set'}) #${match.card_number || '?'}`);
            console.log(`   CardMarket avg: €${avgPrice}, TCGPlayer market: €${tcgMarketPrice}`);
            
            // Set CardMarket prices
            if (avgPrice > 0 || lowPrice > 0) {
              prices.eu = {
                found: true,
                source: 'CardMarket',
                avg: avgPrice,
                low: lowPrice,
                trend: cmPrices['7d_average'] || avgPrice,
                currency: 'EUR',
                image: match.image || match.imageUrl || null,
                matchedCard: `${match.name} (${match.episode?.name || 'unknown'}) #${match.card_number || '?'}`, // For debugging
              };
              console.log('✅ CardMarket: Found prices for exact match');
            } else {
              console.log('⚠️ CardMarket: Exact match found but no prices available');
              prices.eu = { found: false, source: 'CardMarket', reason: 'Match found but no prices' };
            }
            
            // Also set TCGPlayer prices if we haven't found them yet and CardMarket API has them
            // Note: CardMarket API returns TCGPlayer prices in EUR, we need to convert
            if ((!prices.us || !prices.us.found) && (tcgMarketPrice > 0 || tcgMidPrice > 0)) {
              // CardMarket's tcg_player prices are already in USD (despite the API structure suggesting EUR)
              // This is based on testing - they match TCGPlayer's USD prices
              prices.us = {
                found: true,
                source: 'TCGPlayer (via CardMarket)',
                market: tcgMarketPrice,
                low: tcgMarketPrice * 0.85, // Estimate
                mid: tcgMidPrice || tcgMarketPrice,
                high: tcgMarketPrice * 1.15, // Estimate
                currency: 'USD',
                matchedCard: `${match.name} (${match.episode?.name || 'unknown'}) #${match.card_number || '?'}`, // For debugging
              };
              console.log('✅ TCGPlayer: Found prices via CardMarket API ($' + tcgMarketPrice + ')');
            }
          }
        } else {
          console.log('⚠️ CardMarket: No results found');
          prices.eu = { found: false, source: 'CardMarket' };
        }
      } else {
        console.log(`   ⚠️ CardMarket API failed: ${cmResponse.status}`);
        prices.eu = { found: false, source: 'CardMarket' };
      }
    } catch (error) {
      console.error('❌ CardMarket error:', error.message);
      prices.eu = { found: false, error: error.message };
    }
    
    // 3. FALLBACK: Use PriceCharting if both TCGPlayer and CardMarket failed OR returned $0
    // This handles Japanese promos, old sets, and other cards not in the main APIs
    const usHasRealPrice = prices.us?.found && prices.us.market > 0;
    const euHasRealPrice = prices.eu?.found && prices.eu.avg > 0;
    
    console.log(`📊 Price check: US=${usHasRealPrice ? `$${prices.us.market}` : 'NO'}, EU=${euHasRealPrice ? `€${prices.eu.avg}` : 'NO'}`);
    console.log(`   prices.us:`, JSON.stringify(prices.us));
    console.log(`   prices.eu:`, JSON.stringify(prices.eu));
    
    if (!usHasRealPrice && !euHasRealPrice) {
      try {
        console.log('🔄 Both markets failed, trying PriceCharting fallback...');
        
        // Build search query
        let searchQuery = name;
        if (set) searchQuery += ` ${set}`;
        if (number) searchQuery += ` #${number}`;
        
        // Get more results to find best match (increased from limit=1 to limit=10)
        const pcUrl = `https://www.pricecharting.com/api/products?t=${PRICECHARTING_API_KEY}&q=${encodeURIComponent(searchQuery)}&type=videogames&console=pokemon-cards&limit=10`;
        
        console.log(`   Searching PriceCharting: "${searchQuery}"`);
        const pcResponse = await fetch(pcUrl);
        
        if (pcResponse.ok) {
          const pcData = await pcResponse.json();
          const products = pcData.products || [];
          
          console.log(`   Found ${products.length} PriceCharting result(s)`);
          
          if (products.length > 0) {
            // Try to find best match
            let bestMatch = null;
            
            // If we have a card number, try to match it
            if (number) {
              const numberStr = String(number).replace(/^0+/, ''); // Remove leading zeros
              bestMatch = products.find(product => {
                const productName = product['product-name'] || '';
                // Look for #223, #223/250, etc.
                const hasMatchingNumber = productName.includes(`#${number}`) || productName.includes(`#${numberStr}`);
                console.log(`   Checking: "${productName}" - Number match: ${hasMatchingNumber}`);
                return hasMatchingNumber;
              });
            }
            
            // If no number match or no number provided, use first result but log a warning
            if (!bestMatch) {
              bestMatch = products[0];
              if (number) {
                console.log(`⚠️ PriceCharting: No exact card number match for #${number}, using first result`);
              }
              console.log(`   Using first result: "${bestMatch['product-name']}"`);
            } else {
              console.log(`   ✅ Found matching card: "${bestMatch['product-name']}"`);
            }
            
            // PriceCharting returns prices in CENTS, divide by 100
            const loosePrice = (parseFloat(bestMatch['loose-price']) || 0) / 100;
            const cibPrice = (parseFloat(bestMatch['cib-price']) || 0) / 100;
            const newPrice = (parseFloat(bestMatch['new-price']) || 0) / 100;
            
            // Use loose price as ungraded price (most relevant for cards)
            const ungradedPrice = loosePrice || cibPrice || newPrice || 0;
            
            if (ungradedPrice > 0) {
              // Set as US price (PriceCharting uses USD)
              prices.us = {
                found: true,
                source: 'PriceCharting',
                market: ungradedPrice,
                low: ungradedPrice * 0.8, // Estimate
                mid: ungradedPrice,
                high: ungradedPrice * 1.2, // Estimate
                currency: 'USD',
                fallback: true, // Mark as fallback
                matchedProduct: bestMatch['product-name'], // For debugging
              };
              
              console.log(`✅ PriceCharting fallback: Found price $${ungradedPrice} for "${bestMatch['product-name']}"`);
            } else {
              console.log('⚠️ PriceCharting: Product found but no ungraded price');
            }
          } else {
            console.log('⚠️ PriceCharting: No matching products found');
          }
        } else {
          console.log(`⚠️ PriceCharting API failed: ${pcResponse.status}`);
        }
      } catch (error) {
        console.error('❌ PriceCharting fallback error:', error.message);
      }
    }
    
    // Return both market prices (with possible PriceCharting fallback)
    res.status(200).json({
      success: true,
      card: { name, set, number },
      prices: prices,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Error fetching market prices:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DEPRECATED: Use fetchMarketPrices instead
 * Kept for backwards compatibility during transition
 */
exports.fetchComprehensivePrices = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const { name, set, number, isGraded, grade } = req.query;
    
    if (!name) {
      res.status(400).json({ error: 'Missing required parameter: name' });
      return;
    }
    
    console.log(`💰 Fetching comprehensive prices for: ${name} (${set} #${number})`);
    
    const prices = {
      priceCharting: null,
      pokemonPriceTracker: null,
      cardMarket: null,
    };
    
    // 1. Fetch from PriceCharting (cached CSV search)
    try {
      console.log('📊 Searching PriceCharting cache...');
      const db = admin.firestore();
      const queryLower = name.toLowerCase();
      
      const snapshot = await db.collection('pricecharting_cache')
        .where('nameLower', '>=', queryLower)
        .where('nameLower', '<=', queryLower + '\uf8ff')
        .limit(10)
        .get();
      
      if (!snapshot.empty) {
        const bestMatch = snapshot.docs[0].data();
        prices.priceCharting = {
          found: true,
          source: 'PriceCharting (cached)',
          ungraded: parseFloat(bestMatch['loose-price']) || 0,
          graded: {
            psa7: parseFloat(bestMatch['cib-price']) || 0,
            psa8: parseFloat(bestMatch['new-price']) || 0,
            psa9: parseFloat(bestMatch['graded-price']) || 0,
            psa9_5: parseFloat(bestMatch['box-only-price']) || 0,
            psa10: parseFloat(bestMatch['manual-only-price']) || 0,
            bgs10: parseFloat(bestMatch['bgs-10-price']) || 0,
            cgc10: parseFloat(bestMatch['condition-17-price']) || 0,
            sgc10: parseFloat(bestMatch['condition-18-price']) || 0,
          },
        };
        console.log('✅ PriceCharting: Found cached data');
      } else {
        console.log('⚠️ PriceCharting: No cached data found');
        prices.priceCharting = { found: false, source: 'PriceCharting (cached)' };
      }
    } catch (error) {
      console.error('❌ PriceCharting error:', error.message);
      prices.priceCharting = { found: false, error: error.message };
    }
    
    // 2. Fetch from Pokemon Price Tracker (TCGPlayer prices)
    try {
      console.log('📈 Fetching Pokemon Price Tracker data...');
      const title = `${name}${set ? ` ${set}` : ''}${number ? ` #${number}` : ''}`;
      
      const parseResponse = await fetch('https://www.pokemonpricetracker.com/api/v2/parse-title', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${POKEPRICE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          options: { fuzzyMatching: true, maxSuggestions: 3 },
        }),
      });
      
      if (parseResponse.ok) {
        const parseData = await parseResponse.json();
        
        if (parseData?.data?.matches?.length > 0) {
          const match = parseData.data.matches[0];
          
          // Fetch detailed pricing
          const cardResponse = await fetch(
            `https://www.pokemonpricetracker.com/api/v2/cards?tcgPlayerId=${match.tcgPlayerId}&includeEbay=${isGraded === 'true'}`,
            {
              headers: { 'Authorization': `Bearer ${POKEPRICE_API_KEY}` },
            }
          );
          
          if (cardResponse.ok) {
            const cardData = await cardResponse.json();
            
            prices.pokemonPriceTracker = {
              found: true,
              source: 'Pokemon Price Tracker',
              tcgPlayerMarket: cardData.data?.prices?.tcgPlayer?.marketPrice || 0,
              tcgPlayerLow: cardData.data?.prices?.tcgPlayer?.lowPrice || 0,
              tcgPlayerMid: cardData.data?.prices?.tcgPlayer?.midPrice || 0,
              tcgPlayerHigh: cardData.data?.prices?.tcgPlayer?.highPrice || 0,
            };
            
            // Add eBay/PSA data if graded
            if (isGraded === 'true' && cardData.data?.ebay?.salesByGrade) {
              const gradeKey = `psa${grade.replace('.', '')}`;
              if (cardData.data.ebay.salesByGrade[gradeKey]) {
                prices.pokemonPriceTracker.psaGraded = {
                  grade: grade,
                  price: cardData.data.ebay.salesByGrade[gradeKey].smartMarketPrice?.price || 
                         cardData.data.ebay.salesByGrade[gradeKey].averagePrice || 0,
                };
              }
            }
            
            console.log('✅ Pokemon Price Tracker: Found data');
          }
        } else {
          console.log('⚠️ Pokemon Price Tracker: No matches found');
          prices.pokemonPriceTracker = { found: false, source: 'Pokemon Price Tracker' };
        }
      }
    } catch (error) {
      console.error('❌ Pokemon Price Tracker error:', error.message);
      prices.pokemonPriceTracker = { found: false, error: error.message };
    }
    
    // 3. Fetch from CardMarket (EU prices & images)
    try {
      console.log('🇪🇺 Fetching CardMarket data...');
      const searchUrl = `https://cardmarket-api-tcg.p.rapidapi.com/pokemon/cards/search?search=${encodeURIComponent(name)}`;
      
      const cmResponse = await fetch(searchUrl, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'cardmarket-api-tcg.p.rapidapi.com',
        },
      });
      
      if (cmResponse.ok) {
        const cmData = await cmResponse.json();
        const cards = cmData?.data || cmData?.results || [];
        
        if (cards.length > 0) {
          const match = cards[0];
          prices.cardMarket = {
            found: true,
            source: 'CardMarket',
            avgPrice: match.prices?.averageSellPrice || 0,
            lowPrice: match.prices?.lowPrice || 0,
            trendPrice: match.prices?.trendPrice || 0,
            image: match.image || match.imageUrl || null,
          };
          console.log('✅ CardMarket: Found data');
        } else {
          console.log('⚠️ CardMarket: No results found');
          prices.cardMarket = { found: false, source: 'CardMarket' };
        }
      }
    } catch (error) {
      console.error('❌ CardMarket error:', error.message);
      prices.cardMarket = { found: false, error: error.message };
    }
    
    // Return comprehensive pricing
    res.status(200).json({
      success: true,
      card: { name, set, number },
      prices: prices,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Error fetching comprehensive prices:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * ============================================================================
 * COMPREHENSIVE CARD DATABASE CACHE SYSTEM
 * ============================================================================
 * Scheduled function that runs daily at 2 AM UTC to:
 * 1. Discover all unique cards from all users
 * 2. Update centralized card_database collection with fresh prices
 * 3. Update all user collections/inventories with new market prices
 * 4. Preserve all manual overrides (overridePrice, manualPrice)
 */

// Helper: Generate card key for deduplication
function generateCardKey(card) {
  const name = String(card.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const set = String(card.set || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const number = String(card.number || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${name}-${set}-${number}`;
}

// Helper: Generate search terms for optimization
function generateSearchTerms(card) {
  const terms = new Set();
  
  // Add name tokens (include short terms like "ex", "v", "gx")
  if (card.name) {
    String(card.name).toLowerCase().split(/\s+/).forEach(term => {
      const cleaned = term.trim();
      if (cleaned.length > 0) terms.add(cleaned);
    });
  }
  
  // Add set tokens (but keep minimum length of 3 for sets to avoid noise)
  if (card.set) {
    String(card.set).toLowerCase().split(/\s+/).forEach(term => {
      const cleaned = term.trim();
      if (cleaned.length > 2) terms.add(cleaned);
    });
  }
  
  // Add number (always include numbers)
  if (card.number) {
    terms.add(String(card.number).toLowerCase().trim());
  }
  
  return Array.from(terms);
}

// Helper: Fetch market prices using existing fetchMarketPrices function
async function fetchMarketPricesInternal(card) {
  try {
    const params = new URLSearchParams({
      name: card.name || '',
      set: card.set || '',
      number: card.number || '',
    });
    
    // Call the existing fetchMarketPrices endpoint internally
    const url = `https://us-central1-rafchu-tcg-app.cloudfunctions.net/fetchMarketPrices?${params}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`Failed to fetch prices for ${card.name}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    return data.success ? data.prices : null;
  } catch (error) {
    console.error(`Error fetching market prices for ${card.name}:`, error);
    return null;
  }
}

// Helper: Fetch graded prices for all common grades
async function fetchAllGradedPrices(card) {
  const gradedPrices = {};
  const companies = ['PSA', 'BGS', 'CGC', 'SGC'];
  const grades = ['10', '9.5', '9', '8.5', '8', '7'];
  
  // Fetch in batches with delays to avoid rate limiting
  for (const company of companies) {
    for (const grade of grades) {
      try {
        const params = new URLSearchParams({
          name: card.name || '',
          set: card.set || '',
          number: card.number || '',
          company: company,
          grade: grade
        });
        
        const url = `https://us-central1-rafchu-tcg-app.cloudfunctions.net/fetchGradedPrices?${params}`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          if (data.graded && data.graded.price) {
            gradedPrices[`${company}-${grade}`] = data.graded.price;
          }
        }
      } catch (error) {
        // Skip failed grades silently
      }
      
      // Small delay to avoid rate limiting (100ms between requests)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return gradedPrices;
}

// Helper: Check if graded prices need updating (weekly)
function shouldUpdateGradedPrices(cardData) {
  if (!cardData || !cardData.gradedPrices || !cardData.gradedPrices.lastUpdated) {
    return true;
  }
  
  const lastUpdate = cardData.gradedPrices.lastUpdated.toMillis 
    ? cardData.gradedPrices.lastUpdated.toMillis() 
    : Date.parse(cardData.gradedPrices.lastUpdated);
  const weekInMs = 7 * 24 * 60 * 60 * 1000;
  return (Date.now() - lastUpdate) > weekInMs;
}

// Helper: Calculate suggested price from market prices (same logic as frontend)
function calculateSuggestedPrice(prices) {
  if (!prices) return 0;
  
  // Support both old API format (us/eu) and new frontend format (tcgplayer/cardmarket)
  const tcgMarket = prices.us?.market || prices.tcgplayer?.market_price || 0;
  const cmAvg = prices.eu?.avg || prices.cardmarket?.average || prices.cardmarket?.avg30 || 0;
  const cmLow = prices.eu?.low || prices.cardmarket?.lowest || prices.cardmarket?.lowest_near_mint || 0;
  
  // Match frontend logic: max of (max(cmAvg, cmLow), tcg)
  const cmBase = Math.max(Number(cmAvg) || 0, Number(cmLow) || 0);
  const safeTcg = Number(tcgMarket) || 0;
  
  if (cmBase <= 0 && safeTcg <= 0) return 0;
  if (cmBase <= 0) return safeTcg;
  if (safeTcg <= 0) return cmBase;
  
  return Math.max(cmBase, safeTcg);
}

// PHASE 1: Discover all unique cards from all users
async function discoverAllUniqueCards(db) {
  console.log('📦 Starting card discovery...');
  const uniqueCards = new Map();
  
  // Helper to add card to map
  const addCard = (card) => {
    if (!card.name) return;
    const key = generateCardKey(card);
    if (!uniqueCards.has(key)) {
      uniqueCards.set(key, {
        name: card.name,
        set: card.set || '',
        number: card.number || '',
        image: card.image || card.imageUrl || '',
        rarity: card.rarity || '',
        ...card
      });
    }
  };
  
  // Scan all vendor inventories
  console.log('📦 Scanning vendor inventories...');
  const vendorSnapshot = await db.collection('collections').get();
  let vendorCount = 0;
  vendorSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach(addCard);
      vendorCount++;
    }
  });
  console.log(`   ✅ Scanned ${vendorCount} vendor inventories`);
  
  // Scan all collector collections
  console.log('📦 Scanning collector collections...');
  const collectorSnapshot = await db.collection('collector_collections').get();
  let collectorCount = 0;
  collectorSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach(addCard);
      collectorCount++;
    }
  });
  console.log(`   ✅ Scanned ${collectorCount} collector collections`);
  
  // Scan collector wishlists
  console.log('📦 Scanning wishlists...');
  const wishlistSnapshot = await db.collection('collector_wishlists').get();
  let wishlistCount = 0;
  wishlistSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach(addCard);
      wishlistCount++;
    }
  });
  console.log(`   ✅ Scanned ${wishlistCount} wishlists`);
  
  console.log(`📊 Discovered ${uniqueCards.size} unique cards`);
  return uniqueCards;
}

// Helper: Transform API price format to frontend-expected format
function transformPriceStructure(apiPrices) {
  if (!apiPrices || (!apiPrices.us && !apiPrices.eu)) {
    return null;
  }
  
  const transformed = {};
  
  // Transform US prices (TCGPlayer) to frontend format
  if (apiPrices.us && apiPrices.us.found && apiPrices.us.market > 0) {
    transformed.tcgplayer = {
      market_price: apiPrices.us.market,
      mid_price: apiPrices.us.mid || apiPrices.us.market,
      low_price: apiPrices.us.low || apiPrices.us.market,
      high_price: apiPrices.us.high || apiPrices.us.market,
      currency: apiPrices.us.currency || 'USD',
    };
  }
  
  // Transform EU prices (CardMarket) to frontend format
  if (apiPrices.eu && apiPrices.eu.found && apiPrices.eu.avg > 0) {
    transformed.cardmarket = {
      average: apiPrices.eu.avg,
      avg30: apiPrices.eu.avg, // Alias for 30-day average
      lowest: apiPrices.eu.low,
      lowest_near_mint: apiPrices.eu.low,
      trend: apiPrices.eu.trend || apiPrices.eu.avg,
      currency: apiPrices.eu.currency || 'EUR',
    };
  }
  
  // Return null if no valid prices found
  return Object.keys(transformed).length > 0 ? transformed : null;
}

// ================================================================================
// JUSTTCG API HELPERS - Japanese Card Data (18,000+ cards)
// ================================================================================

/**
 * Fetch Japanese card data from JustTCG API
 * @param {string} query - Search query
 * @param {number} limit - Max results (1-20)
 * @returns {Promise<Array>} - Array of card objects
 */
async function fetchJustTCGCards(query, limit = 20) {
  try {
    const params = new URLSearchParams({
      q: query,
      game: 'pokemon-japan',
      limit: Math.min(limit, 20).toString()
    });
    
    const response = await fetch(`${JUSTTCG_API_URL}/cards?${params}`, {
      headers: {
        'x-api-key': JUSTTCG_API_KEY
      }
    });
    
    if (!response.ok) {
      console.warn(`JustTCG API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('JustTCG API fetch error:', error);
    return [];
  }
}

/**
 * Fetch Japanese card by specific set
 * @param {string} setId - JustTCG set ID
 * @param {number} limit - Max results
 * @returns {Promise<Array>} - Array of card objects
 */
async function fetchJustTCGCardsBySet(setId, limit = 20) {
  try {
    const params = new URLSearchParams({
      game: 'pokemon-japan',
      set: setId,
      limit: Math.min(limit, 20).toString()
    });
    
    const response = await fetch(`${JUSTTCG_API_URL}/cards?${params}`, {
      headers: {
        'x-api-key': JUSTTCG_API_KEY
      }
    });
    
    if (!response.ok) {
      console.warn(`JustTCG API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('JustTCG API fetch error:', error);
    return [];
  }
}

/**
 * Transform JustTCG card to our internal format
 * @param {Object} jtcgCard - JustTCG card object
 * @returns {Object} - Normalized card object
 */
function transformJustTCGCard(jtcgCard) {
  // Get price from first variant (Near Mint preferred)
  let price = 0;
  let lowPrice = 0;
  let priceHistory = [];
  let variant = null;
  
  if (jtcgCard.variants && jtcgCard.variants.length > 0) {
    // Prefer Near Mint variant for market price
    variant = jtcgCard.variants.find(v => v.condition === 'Near Mint') || jtcgCard.variants[0];
    price = variant.price || 0;
    priceHistory = variant.priceHistory || [];
    
    // Get lowest price from all variants
    const prices = jtcgCard.variants.map(v => v.price || 0).filter(p => p > 0);
    lowPrice = prices.length > 0 ? Math.min(...prices) : price;
  }
  
  // Convert USD to EUR (approximate rate for CardMarket display)
  // JustTCG prices are in USD, frontend expects EUR for CardMarket
  const usdToEur = 0.92;
  const priceEur = price * usdToEur;
  const lowPriceEur = lowPrice * usdToEur;
  
  // Build image URLs from TCGPlayer ID (if available)
  // TCGPlayer CDN hosts images for Japanese cards too!
  const tcgpId = jtcgCard.tcgplayerId;
  const imageUrl = tcgpId ? `https://tcgplayer-cdn.tcgplayer.com/product/${tcgpId}_200w.jpg` : null;
  const imageLarge = tcgpId ? `https://product-images.tcgplayer.com/fit-in/400x400/${tcgpId}.jpg` : null;
  
  return {
    // Basic info
    name: jtcgCard.name,
    set: jtcgCard.set_name || '',
    number: jtcgCard.number || '',
    rarity: jtcgCard.rarity || '',
    
    // IDs
    id: jtcgCard.id,
    justTcgId: jtcgCard.id,
    tcgplayerId: tcgpId || null,
    
    // Images from TCGPlayer CDN
    image: imageLarge || imageUrl || '',
    imageUrl: imageLarge || imageUrl || '',
    imageSmall: imageUrl || '',
    imageLarge: imageLarge || '',
    
    // Japanese flag
    isJapanese: true,
    language: 'Japanese',
    
    // Prices in BOTH formats for frontend compatibility
    prices: {
      // JustTCG native format
      justtcg: {
        price: price,
        low: lowPrice,
        condition: variant?.condition || 'Unknown',
        printing: variant?.printing || 'Normal',
        currency: 'USD',
        lastUpdated: variant?.lastUpdated || null,
        priceChange7d: variant?.priceChange7d || 0,
        priceChange30d: variant?.priceChange30d || 0,
      },
      // TCGPlayer format (USD) - for frontend compatibility
      tcgplayer: {
        market_price: price,
        mid_price: price,
        low_price: lowPrice,
        high_price: price,
        currency: 'USD',
      },
      // CardMarket format (EUR) - for frontend compatibility
      cardmarket: {
        average: priceEur,
        avg30: priceEur,
        lowest: lowPriceEur,
        lowest_near_mint: priceEur,
        trend: priceEur,
        currency: 'EUR',
      }
    },
    
    // All variants for comprehensive pricing
    variants: (jtcgCard.variants || []).map(v => ({
      condition: v.condition,
      printing: v.printing,
      language: v.language || 'Japanese',
      price: v.price,
      lastUpdated: v.lastUpdated,
    })),
    
    // Source tracking
    dataSource: 'justtcg',
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Fetch prices for a Japanese card from JustTCG
 * @param {Object} card - Card object with name, set, number
 * @returns {Promise<Object|null>} - Price data or null
 */
async function fetchJustTCGPricesForCard(card) {
  try {
    // Search for the card by name
    const searchQuery = card.name;
    const results = await fetchJustTCGCards(searchQuery, 20);
    
    if (!results || results.length === 0) {
      return null;
    }
    
    // Try to find exact match by set and number
    let match = results.find(r => {
      const setMatch = !card.set || r.set_name?.toLowerCase().includes(card.set.toLowerCase());
      const numMatch = !card.number || r.number?.includes(card.number);
      return setMatch && numMatch;
    });
    
    // If no exact match, use first result
    if (!match && results.length > 0) {
      match = results[0];
    }
    
    if (!match) {
      return null;
    }
    
    return transformJustTCGCard(match);
  } catch (error) {
    console.error(`Error fetching JustTCG prices for ${card.name}:`, error);
    return null;
  }
}

// ================================================================================
// END JUSTTCG API HELPERS
// ================================================================================

// PHASE 2: Update card database cache
async function updateSingleCardInCache(db, card, existingCard) {
  const cardKey = generateCardKey(card);
  const cardRef = db.collection('card_database').doc(cardKey);
  const isNew = !existingCard;
  
  // Fetch fresh market prices
  console.log(`   💰 Fetching prices for: ${card.name}...`);
  const marketPricesRaw = await fetchMarketPricesInternal(card);
  let marketPrices = transformPriceStructure(marketPricesRaw);
  
  // For Japanese cards, also fetch from JustTCG
  let justTcgData = null;
  if (card.isJapanese || card.language === 'Japanese') {
    console.log(`   🇯🇵 Fetching JustTCG prices for Japanese card: ${card.name}...`);
    justTcgData = await fetchJustTCGPricesForCard(card);
    if (justTcgData && justTcgData.prices) {
      marketPrices = {
        ...marketPrices,
        justtcg: justTcgData.prices.justtcg
      };
      console.log(`   ✅ JustTCG price found: $${justTcgData.prices.justtcg?.price || 0}`);
    }
  }
  
  // Fetch graded prices if we don't have them or they're old
  let gradedPrices = existingCard?.gradedPrices || {};
  if (!existingCard || shouldUpdateGradedPrices(existingCard)) {
    console.log(`   🏆 Fetching graded prices for: ${card.name}...`);
    const freshGradedPrices = await fetchAllGradedPrices(card);
    if (Object.keys(freshGradedPrices).length > 0) {
      gradedPrices = {
        ...freshGradedPrices,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
    }
  }
  
  // Check for community uploaded image
  let finalImage = card.image || card.imageUrl || existingCard?.image || '';
  
  // Check community_images collection for this card
  try {
    const communityImageQuery = await db.collection('community_images')
      .where('cardName', '==', card.name)
      .where('cardSet', '==', card.set || '')
      .where('cardNumber', '==', card.number || '')
      .where('status', '==', 'approved')
      .limit(1)
      .get();
    
    if (!communityImageQuery.empty) {
      const communityImage = communityImageQuery.docs[0].data();
      finalImage = communityImage.imageUrl || finalImage;
      console.log(`   📸 Using community image for: ${card.name}`);
    }
  } catch (error) {
    console.warn(`   ⚠️ Failed to check community images for ${card.name}:`, error.message);
  }
  
  // Build complete card document
  const cardData = {
    cardKey,
    name: card.name,
    set: card.set || '',
    number: card.number || '',
    rarity: card.rarity || '',
    nameNumbered: `${card.name} #${card.number}`,
    
    // Images (prioritize community uploads, then existing, then API)
    image: finalImage,
    imageSmall: card.imageSmall || existingCard?.imageSmall || '',
    
    // IDs
    cardMarketId: card.id || card.cardMarketId || existingCard?.cardMarketId || '',
    priceChartingId: card.priceChartingId || existingCard?.priceChartingId || '',
    
    // Prices
    prices: marketPrices || existingCard?.prices || null,
    gradedPrices: gradedPrices,
    
    // Metadata
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: existingCard?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updateCount: (existingCard?.updateCount || 0) + 1,
    
    // Search optimization
    searchTerms: generateSearchTerms(card),
    
    // Variants
    isReverseHolo: card.isReverseHolo || false,
    isFirstEdition: card.isFirstEdition || false,
    isJapanese: card.isJapanese || false,
  };
  
  // Compare old vs new suggested price for change tracking
  let priceChange = null;
  if (!isNew && existingCard?.prices) {
    const oldSuggested = calculateSuggestedPrice(existingCard.prices);
    const newSuggested = calculateSuggestedPrice(marketPrices);
    const diff = newSuggested - oldSuggested;
    const pctChange = oldSuggested > 0 ? (diff / oldSuggested) * 100 : (newSuggested > 0 ? 100 : 0);

    if (Math.abs(diff) >= 0.01) {
      priceChange = {
        cardKey,
        name: card.name,
        set: card.set || '',
        number: card.number || '',
        rarity: card.rarity || '',
        image: finalImage,
        oldPrice: Math.round(oldSuggested * 100) / 100,
        newPrice: Math.round(newSuggested * 100) / 100,
        diff: Math.round(diff * 100) / 100,
        pctChange: Math.round(pctChange * 100) / 100,
        isJapanese: card.isJapanese || false,
      };
      console.log(`   📈 Price change: ${card.name} ${oldSuggested.toFixed(2)} → ${newSuggested.toFixed(2)} (${diff > 0 ? '+' : ''}${diff.toFixed(2)})`);
    }
  }

  await cardRef.set(cardData, { merge: true });
  console.log(`   ✅ ${isNew ? 'Created' : 'Updated'}: ${card.name}`);
  
  return { isNew, cardKey, priceChange };
}

async function updateCardDatabase(db, uniqueCards) {
  console.log('🔄 Updating card database...');
  const stats = { updated: 0, new: 0, failed: 0 };
  const priceChanges = [];
  const cardArray = Array.from(uniqueCards.values());
  const batchSize = 10; // Smaller batches to avoid rate limits
  
  // Get existing cards from database for reference
  const existingCardsSnapshot = await db.collection('card_database').get();
  const existingCardsMap = new Map();
  existingCardsSnapshot.forEach(doc => {
    existingCardsMap.set(doc.id, doc.data());
  });
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < cardArray.length; i += batchSize) {
    const batch = cardArray.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (card) => {
      try {
        const cardKey = generateCardKey(card);
        const existing = existingCardsMap.get(cardKey);
        const updated = await updateSingleCardInCache(db, card, existing);
        if (updated.isNew) {
          stats.new++;
        } else {
          stats.updated++;
        }
        if (updated.priceChange) {
          priceChanges.push(updated.priceChange);
        }
      } catch (error) {
        console.error(`Failed to update card ${card.name}:`, error);
        stats.failed++;
      }
    }));
    
    // Rate limiting: wait 2 seconds between batches
    if (i + batchSize < cardArray.length) {
      console.log(`   ⏳ Waiting before next batch... (${i + batchSize}/${cardArray.length})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`   📊 Progress: ${Math.min(i + batchSize, cardArray.length)}/${cardArray.length} cards processed`);
  }

  // Store price changes log if any prices moved
  if (priceChanges.length > 0) {
    const sorted = priceChanges.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    console.log(`📈 ${priceChanges.length} cards had price changes`);

    await db.collection('price_change_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'daily_update',
      totalChanges: priceChanges.length,
      increases: priceChanges.filter(c => c.diff > 0).length,
      decreases: priceChanges.filter(c => c.diff < 0).length,
      topMovers: sorted.slice(0, 20),
      allChanges: sorted,
    });
  } else {
    console.log('📊 No price changes detected in this sync');
    await db.collection('price_change_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'daily_update',
      totalChanges: 0,
      increases: 0,
      decreases: 0,
      topMovers: [],
      allChanges: [],
    });
  }
  
  stats.priceChanges = priceChanges;
  return stats;
}

// PHASE 3: Update all user collections/inventories

/**
 * Recursively strip undefined values from an object so Firestore won't reject the write.
 * Replaces undefined with null at any nesting depth.
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    clean[key] = sanitizeForFirestore(value);
  }
  return clean;
}

/**
 * Process items in batches to avoid overwhelming Firestore with concurrent reads.
 * Each item is processed individually; failures are logged but don't block others.
 */
async function updateItemsInBatches(db, items, updaterFn, batchSize = 20) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(async (item) => {
      try {
        return await updaterFn(db, item);
      } catch (err) {
        console.error(`  ⚠️ Failed to update item "${item.name}" (${item.set} #${item.number}):`, err.message);
        return item; // Return original item on failure so we don't lose data
      }
    }));
    results.push(...batchResults);
  }
  return results;
}

async function updateVendorInventory(db, userId, inventoryData) {
  if (!inventoryData.items || !Array.isArray(inventoryData.items)) {
    return;
  }
  
  const updatedItems = await updateItemsInBatches(db, inventoryData.items, async (db, item) => {
    // Get cached card data
    const cardKey = generateCardKey(item);
    const cachedCard = await db.collection('card_database').doc(cardKey).get();
    
    if (!cachedCard.exists) {
      return item; // No update available
    }
    
    const cached = cachedCard.data();
    
    // Create updated item
    const updatedItem = {
      ...item,
      // Update prices field with fresh market data
      prices: cached.prices || item.prices || {},
      pricesLastUpdated: new Date().toISOString(),
      // Update image if not present (include community images) - use null instead of undefined
      image: item.image || cached.image || item.imageUrl || null,
    };
    
    // CRITICAL: Recalculate suggested price ONLY if no manual override
    if (item.overridePrice == null || item.overridePrice === undefined) {
      if (item.isGraded && cached.gradedPrices) {
        const gradeKey = `${item.gradingCompany}-${item.grade}`;
        updatedItem.calculatedSuggestedPrice = cached.gradedPrices[gradeKey] || item.calculatedSuggestedPrice;
      } else if (cached.prices) {
        // Calculate suggested price from market prices
        const newSuggestedPrice = calculateSuggestedPrice(cached.prices);
        // Only update if we found a valid new price (don't overwrite with 0)
        updatedItem.calculatedSuggestedPrice = newSuggestedPrice > 0 ? newSuggestedPrice : item.calculatedSuggestedPrice;
      }
    }
    
    // CRITICAL: NEVER modify these protected fields
    // - overridePrice, overridePriceCurrency (vendor manual price)
    // - quantity, condition, entryId, addedAt
    // - excludeFromSale, isGraded, gradingCompany, grade
    
    return updatedItem;
  });
  
  // Sanitize all items to strip undefined values before writing to Firestore
  const sanitizedItems = sanitizeForFirestore(updatedItems);
  
  // Save updated inventory
  await db.collection('collections').doc(userId).set(
    { items: sanitizedItems },
    { merge: true }
  );
}

async function updateCollectorCollection(db, userId, collectionData) {
  if (!collectionData.items || !Array.isArray(collectionData.items)) {
    return;
  }
  
  const updatedItems = await updateItemsInBatches(db, collectionData.items, async (db, item) => {
    // Get cached card data
    const cardKey = generateCardKey(item);
    const cachedCard = await db.collection('card_database').doc(cardKey).get();
    
    if (!cachedCard.exists) {
      return item; // No update available
    }
    
    const cached = cachedCard.data();
    
    // Create updated item
    const updatedItem = {
      ...item,
      // Update prices field with fresh market data
      prices: cached.prices || item.prices || {},
      pricesLastUpdated: new Date().toISOString(),
      // Update image if not present (include community images) - use null instead of undefined
      image: item.image || cached.image || item.imageUrl || null,
    };
    
    // Update graded price if applicable
    if (item.isGraded && cached.gradedPrices) {
      const gradeKey = `${item.gradingCompany}-${item.grade}`;
      const newGradedPrice = cached.gradedPrices[gradeKey];
      // Only update if we found a valid new price (don't overwrite with undefined/0)
      updatedItem.gradedPrice = (newGradedPrice && newGradedPrice > 0) ? newGradedPrice : item.gradedPrice;
    }
    
    // CRITICAL: NEVER modify these protected fields
    // - manualPrice (collector manual value)
    // - quantity, condition, entryId, addedAt
    // - isGraded, gradingCompany, grade
    
    return updatedItem;
  });
  
  // Sanitize all items to strip undefined values before writing to Firestore
  const sanitizedItems = sanitizeForFirestore(updatedItems);
  
  // Save updated collection
  await db.collection('collector_collections').doc(userId).set(
    { items: sanitizedItems },
    { merge: true }
  );
}

async function updateAllUserCollections(db) {
  console.log('🔄 Updating user data...');
  const stats = { vendors: 0, collectors: 0, errors: 0, failedUsers: [] };
  
  // Update vendor inventories
  console.log('   📦 Updating vendor inventories...');
  const vendorSnapshot = await db.collection('collections').get();
  
  for (const doc of vendorSnapshot.docs) {
    try {
      await updateVendorInventory(db, doc.id, doc.data());
      stats.vendors++;
    } catch (error) {
      console.error(`Failed to update vendor ${doc.id}:`, error);
      stats.errors++;
      stats.failedUsers.push({
        userId: doc.id,
        type: 'vendor',
        error: error.message,
        itemCount: (doc.data().items || []).length
      });
    }
  }
  
  // Update collector collections
  console.log('   📦 Updating collector collections...');
  const collectorSnapshot = await db.collection('collector_collections').get();
  
  for (const doc of collectorSnapshot.docs) {
    try {
      await updateCollectorCollection(db, doc.id, doc.data());
      stats.collectors++;
    } catch (error) {
      console.error(`Failed to update collector ${doc.id}:`, error);
      stats.errors++;
      stats.failedUsers.push({
        userId: doc.id,
        type: 'collector',
        error: error.message,
        itemCount: (doc.data().items || []).length
      });
    }
  }
  
  return stats;
}

/**
 * Scheduled function: Daily card database update
 * Runs at 2 AM UTC every day
 */
exports.scheduledCardDatabaseUpdate = functions.runWith({
  timeoutSeconds: 540, // 9 minutes
  memory: '2GB'
}).pubsub
  .schedule('0 2 * * *') // 2 AM UTC daily
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🚀 ========================================');
    console.log('🚀 Starting daily card database update...');
    console.log('🚀 ========================================');
    
    const db = admin.firestore();
    const startTime = Date.now();
    
    try {
      // PHASE 1: Discover all unique cards
      const uniqueCards = await discoverAllUniqueCards(db);
      
      // PHASE 2: Update card database cache
      const updateStats = await updateCardDatabase(db, uniqueCards);
      console.log(`✅ Card database updated: ${updateStats.updated} updated, ${updateStats.new} new, ${updateStats.failed} failed`);
      
      // PHASE 3: Update user collections/inventories
      const userStats = await updateAllUserCollections(db);
      console.log(`✅ User data updated: ${userStats.vendors} vendors, ${userStats.collectors} collectors, ${userStats.errors} errors`);
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`✨ Daily update complete in ${duration.toFixed(2)}s`);
      
      // Summarize price changes for the update log
      const changes = updateStats.priceChanges || [];
      const topMovers = changes
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 5)
        .map(c => ({ name: c.name, set: c.set, old: c.oldPrice, new: c.newPrice, diff: c.diff, pct: c.pctChange }));

      // Log success to monitoring collection
      await db.collection('update_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'daily_update',
        status: 'success',
        duration: duration,
        stats: {
          cardsUpdated: updateStats.updated,
          cardsNew: updateStats.new,
          cardsFailed: updateStats.failed,
          vendorsUpdated: userStats.vendors,
          collectorsUpdated: userStats.collectors,
          userErrors: userStats.errors,
          failedUsers: userStats.failedUsers || [],
          totalCards: uniqueCards.size,
          priceChanges: changes.length,
          priceIncreases: changes.filter(c => c.diff > 0).length,
          priceDecreases: changes.filter(c => c.diff < 0).length,
          topMovers: topMovers,
        }
      });
      
      return null;
    } catch (error) {
      console.error('❌ Daily update failed:', error);
      
      // Log failure for monitoring
      await db.collection('update_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'daily_update',
        status: 'error',
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  });

/**
 * One-time initialization function to populate card database
 * Call this manually via HTTPS to initialize the system
 */
exports.initializeCardDatabase = functions.runWith({
  timeoutSeconds: 540, // 9 minutes
  memory: '2GB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // Security: Check for authorization token
  const authHeader = req.headers.authorization;
  const expectedToken = 'Bearer rafchu-init-db-2024'; // Change this to your secret token
  
  if (authHeader !== expectedToken) {
    res.status(403).json({ error: 'Unauthorized. Invalid token.' });
    return;
  }
  
  console.log('🚀 Starting one-time card database initialization...');
  
  const db = admin.firestore();
  const startTime = Date.now();
  
  try {
    // Discover all cards from existing users
    const uniqueCards = await discoverAllUniqueCards(db);
    
    // Populate card database
    const stats = await updateCardDatabase(db, uniqueCards);
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`✅ Initialization complete in ${duration.toFixed(2)}s`);
    
    res.json({
      success: true,
      stats: stats,
      totalCards: uniqueCards.size,
      duration: duration,
      message: `Initialized card database with ${stats.new + stats.updated} cards`
    });
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Manual trigger to push cached prices to all user inventories.
 * Runs Phase 3 only (assumes card_database is already up to date).
 * Usage: GET /triggerUserPriceRefresh
 */
exports.triggerUserPriceRefresh = functions.runWith({
  timeoutSeconds: 300,
  memory: '1GB',
}).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  console.log('🚀 Manual user price refresh triggered');
  const db = admin.firestore();
  const startTime = Date.now();

  try {
    const userStats = await updateAllUserCollections(db);
    const duration = (Date.now() - startTime) / 1000;

    // Log to update_logs
    await db.collection('update_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'manual_user_price_refresh',
      status: userStats.errors === 0 ? 'success' : 'partial',
      duration,
      stats: {
        vendorsUpdated: userStats.vendors,
        collectorsUpdated: userStats.collectors,
        userErrors: userStats.errors,
        failedUsers: userStats.failedUsers || [],
      },
    });

    res.status(200).json({
      success: true,
      message: 'User price refresh complete',
      duration: `${duration.toFixed(2)}s`,
      stats: {
        vendorsUpdated: userStats.vendors,
        collectorsUpdated: userStats.collectors,
        userErrors: userStats.errors,
        failedUsers: userStats.failedUsers || [],
      },
    });
  } catch (error) {
    console.error('❌ User price refresh failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ================================================================================
// SEARCH CARDS WITH CACHE (Expand-on-Search)
// ================================================================================

/**
 * Helper: Search CardMarket API (same as frontend does)
 */
async function searchCardsFromAPI(query) {
  // Try CardMarket first
  try {
    const url = `https://${RAPIDAPI_HOST}/pokemon/cards/search?search=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    });
    
    if (response.ok) {
      const response_data = await response.json();
      const data = response_data.data || response_data;
      
      if (Array.isArray(data) && data.length > 0) {
        return data.map(card => ({
          id: card.id,
          name: card.name,
          set: card.episode?.name || '',
          setSlug: card.episode?.slug || '',
          number: card.card_number || card.collector_number || '',
          rarity: card.rarity || '',
          image: card.image || '',
          imageUrl: card.image || '',
          imageSmall: card.image_small || '',
          nameNumbered: card.name_numbered || `${card.name} #${card.card_number || ''}`,
          slug: card.slug || '',
          cardMarketId: card.id || '',
        })).slice(0, 25);
      }
    } else {
      console.warn(`CardMarket API error: ${response.status} — falling back to TCGdex`);
    }
  } catch (error) {
    console.warn('CardMarket search error, falling back to TCGdex:', error.message);
  }

  // Fallback: TCGdex (free, no key required)
  return searchCardsFromTCGdex(query);
}

/**
 * Search Cards with intelligent caching
 * 1. Query card_database first (FAST)
 * 2. If not found, call existing APIs
 * 3. Cache new cards automatically
 * 4. Return results
 */
exports.searchCards = functions.runWith({
  timeoutSeconds: 60,
  memory: '512MB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const searchQuery = req.query.q || req.body?.query || '';
  
  if (!searchQuery || searchQuery.trim().length < 2) {
    res.json({
      success: true,
      results: [],
      source: 'none',
      message: 'Query too short'
    });
    return;
  }
  
  console.log(`🔍 Search request: "${searchQuery}"`);
  
  const db = admin.firestore();
  const startTime = Date.now();
  
  try {
    // Step 1: Search card_database cache
    // Split and clean search terms (keep short terms like "ex", "v", "gx")
    const searchTerms = String(searchQuery).toLowerCase()
      .split(/\s+/)
      .map(term => term.trim())
      .filter(term => term.length > 0);
    
    let cacheResults = [];
    if (searchTerms.length > 0) {
      // Query Firestore using searchTerms array-contains-any (max 10 terms)
      const queryTerms = searchTerms.slice(0, 10);
      const cacheQuery = await db.collection('card_database')
        .where('searchTerms', 'array-contains-any', queryTerms)
        .limit(50)
        .get();
      
      cacheResults = cacheQuery.docs.map(doc => doc.data());
      
      console.log(`   📦 Found ${cacheResults.length} cached results for terms: ${queryTerms.join(', ')}`);
    }
    
    // Step 2: If we have good cache results, return them
    if (cacheResults.length > 0) {
      // Filter and rank by relevance
      const ranked = cacheResults
        .map(card => {
          const nameLower = String(card.name || '').toLowerCase();
          const setLower = String(card.set || '').toLowerCase();
          const numberLower = String(card.number || '').toLowerCase();
          const queryLower = searchQuery.toLowerCase().trim();
          
          let score = 0;
          
          // Extract likely Pokemon name from query (first 1-2 words before ex/gx/v/vmax/etc)
          const queryWords = queryLower.split(/\s+/);
          const cardTypeKeywords = ['ex', 'gx', 'v', 'vmax', 'vstar', 'break', 'prism'];
          let primaryName = '';
          for (let i = 0; i < queryWords.length; i++) {
            if (cardTypeKeywords.includes(queryWords[i]) || !isNaN(queryWords[i])) {
              // Stop before card type or number
              break;
            }
            primaryName += (primaryName ? ' ' : '') + queryWords[i];
          }
          
          // If we extracted a primary name (e.g., "charizard" or "mew"), require it in card name
          if (primaryName && primaryName.length > 2) {
            if (!nameLower.includes(primaryName)) {
              // Card name doesn't contain the primary Pokemon name - skip it
              return { ...card, _score: 0 };
            }
          }
          
          // Exact name match (highest priority)
          if (nameLower === queryLower) score += 100;
          
          // Name contains full query
          if (nameLower.includes(queryLower)) score += 50;
          
          // Name starts with query
          if (nameLower.startsWith(queryLower)) score += 30;
          
          // Check if all search terms are present
          const allTermsPresent = searchTerms.every(term => 
            nameLower.includes(term) || numberLower.includes(term) || setLower.includes(term)
          );
          if (allTermsPresent) score += 20;
          
          // Boost if number matches
          if (searchTerms.some(term => numberLower === term)) score += 15;
          
          // Set contains query
          if (setLower.includes(queryLower)) score += 5;
          
          return { ...card, _score: score };
        })
        .filter(card => card._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 25);
      
      if (ranked.length > 0) {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`   ✅ Returning ${ranked.length} cached results (${duration.toFixed(3)}s)`);
        
        res.json({
          success: true,
          results: ranked.map(r => {
            delete r._score;
            return r;
          }),
          source: 'cache',
          duration: duration,
          cached: true
        });
        return;
      }
    }
    
    // Step 3: No cache results - fall back to search APIs
    console.log(`   🌐 No cache hits, performing search across APIs...`);
    
    try {
      // Call CardMarket search endpoint
      const searchResults = await searchCardsFromAPI(searchQuery);
      
      if (!searchResults || searchResults.length === 0) {
        console.log(`   ⚠️ No search results found`);
        res.json({
          success: true,
          results: [],
          source: 'api',
          duration: (Date.now() - startTime) / 1000,
          cached: false
        });
        return;
      }
      
      console.log(`   📦 Found ${searchResults.length} search results`);
      
      // Step 4: Cache each search result (asynchronously, don't wait)
      const cachePromises = searchResults.map(async (card) => {
        try {
          // Check for community image
          let finalImage = card.image || card.imageUrl || '';
          try {
            const communityImageQuery = await db.collection('community_images')
              .where('cardName', '==', card.name)
              .where('cardSet', '==', card.set || '')
              .where('cardNumber', '==', String(card.number || ''))
              .where('status', '==', 'approved')
              .limit(1)
              .get();
            
            if (!communityImageQuery.empty) {
              const communityImage = communityImageQuery.docs[0].data();
              finalImage = communityImage.imageUrl || finalImage;
            }
          } catch (err) {
            // Silent fail for community image lookup
          }
          
          // Generate card key and prepare for caching
          const cardKey = generateCardKey(card);
          const cardToCache = {
            ...card,
            image: finalImage,
            cardKey: cardKey,
            searchTerms: generateSearchTerms(card),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
          };
          
          // Save to cache
          await db.collection('card_database').doc(cardKey).set(cardToCache, { merge: true });
          console.log(`   💾 Cached: ${card.name}`);
        } catch (error) {
          console.warn(`   ⚠️ Failed to cache ${card.name}:`, error.message);
        }
      });
      
      // Don't wait for caching to complete
      Promise.all(cachePromises).catch(err => console.warn('Some cards failed to cache:', err.message));
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`   ✅ Returning ${searchResults.length} search results (${duration.toFixed(3)}s)`);
      
      res.json({
        success: true,
        results: searchResults,
        source: 'api',
        duration: duration,
        cached: false,
        message: `Found ${searchResults.length} cards, caching in background`
      });
    } catch (searchError) {
      console.error(`   ❌ Search API error:`, searchError);
      res.json({
        success: true,
        results: [],
        source: 'api',
        duration: (Date.now() - startTime) / 1000,
        cached: false,
        error: searchError.message
      });
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      results: []
    });
  }
});

/**
 * Get cache statistics - count of cached cards and sample data
 * HTTPS callable function (GET/POST)
 */
exports.getCacheStats = functions.runWith({
  timeoutSeconds: 60,
  memory: '512MB'
}).https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const db = admin.firestore();
    
    console.log('📊 Getting cache statistics...');
    
    // Count total cards
    const snapshot = await db.collection('card_database').count().get();
    const count = snapshot.data().count;
    
    // Get sample cards
    const sampleSnapshot = await db.collection('card_database')
      .limit(5)
      .get();
    
    const samples = [];
    sampleSnapshot.forEach(doc => {
      const data = doc.data();
      samples.push({
        name: data.name,
        set: data.set,
        number: data.number,
        lastUpdated: data.lastUpdated?.toDate().toISOString()
      });
    });
    
    // Get most recently updated card
    const recentSnapshot = await db.collection('card_database')
      .orderBy('lastUpdated', 'desc')
      .limit(1)
      .get();
    
    let lastUpdated = null;
    if (!recentSnapshot.empty) {
      const lastUpdatedTimestamp = recentSnapshot.docs[0].data().lastUpdated;
      if (lastUpdatedTimestamp) {
        lastUpdated = lastUpdatedTimestamp.toDate().toISOString();
      }
    }
    
    console.log(`✅ Cache stats retrieved: ${count} cards`);
    
    res.status(200).json({
      success: true,
      totalCards: count,
      lastUpdated,
      samples
    });
  } catch (error) {
    console.error('❌ Failed to get cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ================================================================================
// SECURE CARDMARKET API PROXY
// ================================================================================
// These endpoints allow the frontend to search CardMarket without exposing API keys

/**
 * Secure proxy for CardMarket card search
 * Frontend calls this instead of directly calling RapidAPI
 * Usage: GET /searchCardMarket?q=pikachu&maxResults=50
 */
exports.searchCardMarket = functions.runWith({
  timeoutSeconds: 30,
  memory: '256MB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const query = req.query.q || req.query.query || '';
  const maxResults = parseInt(req.query.maxResults) || 50;
  
  if (!query || query.trim().length < 2) {
    res.json({
      success: true,
      results: [],
      message: 'Query too short'
    });
    return;
  }
  
  console.log(`🔍 CardMarket FULL search: "${query}"`);
  
  try {
    // Try CardMarket first (full database)
    const searchUrl = `https://${RAPIDAPI_HOST}/pokemon/cards?search=${encodeURIComponent(query)}&perPage=${maxResults}`;
    
    let results = [];
    let source = 'cardmarket';

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        results = data?.data || data?.results || (Array.isArray(data) ? data : []);
        console.log(`✅ CardMarket returned ${results.length} results`);
      } else {
        console.warn(`CardMarket API error: ${response.status} — falling back to TCGdex`);
      }
    } catch (cmError) {
      console.warn('CardMarket unreachable, falling back to TCGdex:', cmError.message);
    }

    // Fallback to TCGdex if CardMarket returned nothing
    if (results.length === 0) {
      const tcgdexResults = await searchCardsFromTCGdex(query);
      if (tcgdexResults.length > 0) {
        // Convert TCGdex format to the shape the frontend expects from searchCardMarket
        results = tcgdexResults.map(card => ({
          id: card.id,
          name: card.name,
          card_number: card.number,
          collector_number: card.number,
          rarity: card.rarity,
          image: card.image,
          image_small: card.imageSmall,
          name_numbered: card.nameNumbered,
          slug: card.slug,
          episode: { name: card.set, slug: card.setSlug },
        }));
        source = 'tcgdex';
        console.log(`✅ TCGdex fallback returned ${results.length} results`);
      }
    }

    res.json({
      success: results.length > 0,
      results: results.slice(0, maxResults),
      query: query,
      source
    });
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      success: false,
      results: [],
      error: error.message
    });
  }
});

/**
 * Secure proxy for fetching card details by ID
 * Usage: GET /getCardDetails?id=12345
 */
exports.getCardDetails = functions.runWith({
  timeoutSeconds: 30,
  memory: '256MB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const cardId = req.query.id;
  
  if (!cardId) {
    res.status(400).json({
      success: false,
      error: 'Missing card ID'
    });
    return;
  }
  
  console.log(`🔍 Fetching card details: ${cardId}`);
  
  try {
    const detailUrl = `https://${RAPIDAPI_HOST}/pokemon/cards/${encodeURIComponent(cardId)}`;
    
    const response = await fetch(detailUrl, {
      headers: {
        'Accept': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      cache: 'no-store'
    });
    
    if (!response.ok) {
      console.error(`CardMarket API error: ${response.status}`);
      res.status(200).json({
        success: false,
        card: null,
        error: `Card not found: ${response.status}`
      });
      return;
    }
    
    const card = await response.json();
    
    console.log(`✅ Card details fetched: ${card?.name || cardId}`);
    
    res.json({
      success: true,
      card: card,
      source: 'cardmarket'
    });
    
  } catch (error) {
    console.error('❌ Card details fetch error:', error);
    res.status(500).json({
      success: false,
      card: null,
      error: error.message
    });
  }
});

/**
 * Get update logs for monitoring the scheduled card database updates
 * Query params:
 *   - limit: number of logs to return (default: 20)
 *   - status: filter by status ('success', 'error', or 'all')
 */
exports.getUpdateLogs = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const limit = parseInt(req.query.limit) || 20;
  const statusFilter = req.query.status || 'all';
  
  try {
    const db = admin.firestore();
    let query = db.collection('update_logs')
      .orderBy('timestamp', 'desc')
      .limit(limit);
    
    if (statusFilter !== 'all') {
      query = db.collection('update_logs')
        .where('status', '==', statusFilter)
        .orderBy('timestamp', 'desc')
        .limit(limit);
    }
    
    const snapshot = await query.get();
    
    const logs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
        type: data.type,
        status: data.status,
        duration: data.duration,
        stats: data.stats || null,
        error: data.error || null
      });
    });
    
    res.status(200).json({
      success: true,
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('❌ Error fetching update logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get recent price change logs showing which cards had price movements.
 * Query params:
 *   - limit: number of sync logs to return (default: 5)
 *   - minChange: minimum absolute price change to include (default: 0)
 */
exports.getPriceChanges = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const limit = parseInt(req.query.limit) || 5;
  const minChange = parseFloat(req.query.minChange) || 0;

  try {
    const db = admin.firestore();
    const snapshot = await db.collection('price_change_logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const logs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      let changes = data.allChanges || [];
      if (minChange > 0) {
        changes = changes.filter(c => Math.abs(c.diff) >= minChange);
      }
      logs.push({
        id: doc.id,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
        type: data.type,
        totalChanges: data.totalChanges,
        increases: data.increases,
        decreases: data.decreases,
        topMovers: data.topMovers || [],
        changes: changes,
      });
    });

    res.status(200).json({ success: true, count: logs.length, logs });
  } catch (error) {
    console.error('Error fetching price change logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Check inventory price freshness for a specific user
 * Analyzes when prices were last updated for items in their inventory
 * 
 * Query params:
 *   - userId: the user's Firebase UID (required)
 *   - collection: 'vendor' or 'collector' (default: 'vendor')
 */
exports.checkInventoryPriceFreshness = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const userId = req.query.userId;
  const collectionType = req.query.collection || 'vendor';
  
  if (!userId) {
    res.status(400).json({ success: false, error: 'userId is required' });
    return;
  }
  
  try {
    const db = admin.firestore();
    const collectionName = collectionType === 'collector' ? 'collector_collections' : 'collections';
    
    const doc = await db.collection(collectionName).doc(userId).get();
    
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Inventory not found' });
      return;
    }
    
    const data = doc.data();
    const items = data.items || [];
    
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    const stats = {
      totalItems: items.length,
      updatedLast24h: 0,
      updatedLast3Days: 0,
      updatedLast7Days: 0,
      neverUpdated: 0,
      manualPriceItems: 0,
      gradedItems: 0,
      manualEntryItems: 0,
      sampleItems: [],
      neverUpdatedItems: []
    };
    
    items.forEach((item, index) => {
      if (item.overridePrice != null) stats.manualPriceItems++;
      if (item.isGraded) stats.gradedItems++;
      if (item.isManualEntry) stats.manualEntryItems++;
      
      const lastUpdated = item.pricesLastUpdated ? Date.parse(item.pricesLastUpdated) : null;
      
      if (!lastUpdated) {
        stats.neverUpdated++;
        stats.neverUpdatedItems.push({
          name: item.name,
          set: item.set,
          number: item.number,
          isManualEntry: item.isManualEntry || false,
          isGraded: item.isGraded || false
        });
      } else if (lastUpdated >= oneDayAgo) {
        stats.updatedLast24h++;
      } else if (lastUpdated >= threeDaysAgo) {
        stats.updatedLast3Days++;
      } else if (lastUpdated >= sevenDaysAgo) {
        stats.updatedLast7Days++;
      }
      
      if (index < 10) {
        const tcgPrice = item.prices?.tcgplayer?.market_price || item.prices?.tcgplayer?.mid_price || 0;
        const cmPrice = item.prices?.cardmarket?.avg_price || item.prices?.cardmarket?.avg || 0;
        
        stats.sampleItems.push({
          name: item.name,
          set: item.set,
          number: item.number,
          condition: item.condition,
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || null,
          grade: item.grade || null,
          hasManualPrice: item.overridePrice != null,
          isManualEntry: item.isManualEntry || false,
          pricesLastUpdated: item.pricesLastUpdated || 'Never',
          tcgPrice: tcgPrice,
          cardmarketPrice: cmPrice,
          suggestedPrice: item.calculatedSuggestedPrice || Math.min(tcgPrice, cmPrice) || 0
        });
      }
    });
    
    res.status(200).json({
      success: true,
      userId: userId,
      collectionType: collectionType,
      stats: stats,
      summary: {
        freshPrices: stats.updatedLast24h + " items updated in last 24h",
        staleBreakdown: "3d: " + stats.updatedLast3Days + ", 7d: " + stats.updatedLast7Days + ", never: " + stats.neverUpdated,
        specialItems: stats.manualPriceItems + " manual prices, " + stats.gradedItems + " graded, " + stats.manualEntryItems + " manual entries"
      }
    });
  } catch (error) {
    console.error('Error checking inventory freshness:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// TCG Pocket set names that need to be migrated to proper API data
const TCG_POCKET_SETS = [
  'Mega Evolution',
  'Phantasmal Flames', 
  'Genetic Apex',
  'Mythical Island',
  'Space-Time Smackdown',
  'Triumphant Light',
  'Promo-A',
  'PROMO-A',
  'Gem Pack',
  'SV8: Super Electric Breaker' // This might be pocket too
];

/**
 * Migrate TCG Pocket cards to proper CardMarket API data
 * Finds cards with TCG Pocket set names and re-fetches from real API
 * 
 * Query params:
 *   - userId: the user's Firebase UID (required)
 *   - dryRun: if 'true', just report what would be changed without saving
 */
exports.migrateTcgPocketCards = functions.runWith({
  timeoutSeconds: 300,
  memory: '1GB'
}).https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const userId = req.query.userId;
  const dryRun = req.query.dryRun === 'true';
  
  if (!userId) {
    res.status(400).json({ success: false, error: 'userId is required' });
    return;
  }
  
  console.log(`🔄 Starting TCG Pocket migration for user ${userId} (dryRun: ${dryRun})`);
  
  try {
    const db = admin.firestore();
    const doc = await db.collection('collections').doc(userId).get();
    
    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Inventory not found' });
      return;
    }
    
    const data = doc.data();
    const items = data.items || [];
    
    // Find TCG Pocket cards
    const pocketCards = items.filter(item => {
      const setName = (item.set || '').toLowerCase();
      return TCG_POCKET_SETS.some(pocketSet => 
        setName.includes(pocketSet.toLowerCase())
      );
    });
    
    console.log(`Found ${pocketCards.length} TCG Pocket cards to migrate`);
    
    const results = {
      found: pocketCards.length,
      migrated: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    
    // Process each pocket card
    for (const card of pocketCards) {
      try {
        // Extract Pokemon name (remove set-specific suffixes)
        let searchName = card.name || '';
        // Remove number suffix like "- 132/106"
        searchName = searchName.replace(/\s*-\s*\d+\/\d+$/, '').trim();
        // Remove "ex" suffix for search (will add back if needed)
        const hasEx = searchName.toLowerCase().includes(' ex');
        
        console.log(`Searching for: ${searchName}`);
        
        // Search CardMarket API
        const searchUrl = `https://cardmarket-api-tcg.p.rapidapi.com/pokemon/cards?name=${encodeURIComponent(searchName)}&page=1`;
        
        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'cardmarket-api-tcg.p.rapidapi.com',
            'x-rapidapi-key': '3f1d6d1f79mshd8247af36109787p17ad74jsn078c111f9c8e'
          }
        });
        
        if (!response.ok) {
          console.error(`API error for ${searchName}: ${response.status}`);
          results.failed++;
          results.details.push({
            name: card.name,
            oldSet: card.set,
            status: 'api_error',
            error: `HTTP ${response.status}`
          });
          continue;
        }
        
        const apiData = await response.json();
        const apiCards = apiData.data || apiData || [];
        
        if (!Array.isArray(apiCards) || apiCards.length === 0) {
          console.log(`No results for ${searchName}`);
          results.skipped++;
          results.details.push({
            name: card.name,
            oldSet: card.set,
            status: 'not_found'
          });
          continue;
        }
        
        // Filter out TCG Pocket cards first
        const realCards = apiCards.filter(c => {
          const setName = c.episode?.name || c.set_name || c.set || '';
          return !TCG_POCKET_SETS.some(ps => setName.toLowerCase().includes(ps.toLowerCase()));
        });
        
        // If no real cards found, this might be a Pocket-exclusive card
        if (realCards.length === 0) {
          console.log(`No non-Pocket results for ${searchName} - might be Pocket-exclusive`);
          results.skipped++;
          results.details.push({
            name: card.name,
            oldSet: card.set,
            status: 'pocket_exclusive',
            note: 'Card only exists in TCG Pocket'
          });
          continue;
        }
        
        // Find best match from real cards
        let bestMatch = realCards[0];
        
        // Look for a better match if the card has a number
        if (card.number) {
          const numberMatch = realCards.find(c => 
            String(c.card_number || c.number || '').toLowerCase() === String(card.number).toLowerCase()
          );
          if (numberMatch) {
            bestMatch = numberMatch;
          }
        }
        
        // Get set name from episode object (CardMarket API structure)
        const matchSet = bestMatch.episode?.name || bestMatch.set_name || bestMatch.set || '';
        
        // Skip if the match is also a TCG Pocket card or no set found
        if (!matchSet || TCG_POCKET_SETS.some(ps => matchSet.toLowerCase().includes(ps.toLowerCase()))) {
          console.log(`Match is also TCG Pocket or empty: ${matchSet}`);
          results.skipped++;
          results.details.push({
            name: card.name,
            oldSet: card.set,
            status: 'no_real_match',
            matchedSet: matchSet || 'unknown'
          });
          continue;
        }
        
        const newNumber = bestMatch.card_number || bestMatch.number || card.number;
        const newImage = bestMatch.image || bestMatch.image_url || card.image;
        const newId = bestMatch.id || bestMatch.card_id || card.id;
        const newRarity = bestMatch.rarity || card.rarity;
        const newPrices = bestMatch.prices || {};
        
        results.details.push({
          name: card.name,
          oldSet: card.set,
          newSet: matchSet,
          newNumber: newNumber,
          newRarity: newRarity,
          status: 'migrated'
        });
        
        if (!dryRun) {
          // Update the card in the items array
          const itemIndex = items.findIndex(i => i.entryId === card.entryId);
          if (itemIndex !== -1) {
            items[itemIndex] = {
              ...items[itemIndex],
              set: matchSet,
              number: newNumber,
              rarity: newRarity,
              image: newImage,
              id: newId,
              prices: newPrices,
              // Mark as migrated
              migratedFromPocket: true,
              migratedAt: new Date().toISOString()
            };
          }
        }
        
        results.migrated++;
        
        // Rate limit - wait 200ms between API calls
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (cardError) {
        console.error(`Error processing ${card.name}:`, cardError);
        results.failed++;
        results.details.push({
          name: card.name,
          oldSet: card.set,
          status: 'error',
          error: cardError.message
        });
      }
    }
    
    // Save updated inventory
    if (!dryRun && results.migrated > 0) {
      await db.collection('collections').doc(userId).set(
        { items: items },
        { merge: true }
      );
      console.log(`Saved ${results.migrated} migrated cards`);
    }
    
    res.status(200).json({
      success: true,
      dryRun: dryRun,
      results: results
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Force update ALL cards in the card_database collection
 * This updates every card regardless of whether it's in any user's collection
 * 
 * Query params:
 *   - batchSize: number of cards to process per batch (default: 10)
 *   - skipGraded: if 'true', skip graded price fetching (faster but no graded prices)
 */
exports.forceUpdateAllCards = functions.runWith({
  timeoutSeconds: 540, // 9 minutes max
  memory: '2GB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // Security check via query parameter (to avoid Cloud Functions auth interception)
  const secretToken = req.query.token;
  const expectedToken = 'rafchu-force-update-2024';
  
  if (secretToken !== expectedToken) {
    res.status(403).json({ 
      success: false, 
      error: 'Unauthorized. Include token query parameter: ?token=rafchu-force-update-2024' 
    });
    return;
  }
  
  const batchSize = parseInt(req.query.batchSize) || 10;
  const skipGraded = req.query.skipGraded === 'true';
  
  console.log('🚀 ========================================');
  console.log('🚀 Starting FORCE UPDATE of ALL cards...');
  console.log(`🚀 Batch size: ${batchSize}, Skip graded: ${skipGraded}`);
  console.log('🚀 ========================================');
  
  const db = admin.firestore();
  const startTime = Date.now();
  
  const stats = {
    total: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  try {
    // Get ALL cards from card_database
    const allCardsSnapshot = await db.collection('card_database').get();
    stats.total = allCardsSnapshot.size;
    
    console.log(`📋 Found ${stats.total} cards in database to update`);
    
    const cards = [];
    allCardsSnapshot.forEach(doc => {
      cards.push({ id: doc.id, ...doc.data() });
    });
    
    // Process in batches
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(cards.length/batchSize)} (cards ${i+1}-${Math.min(i+batchSize, cards.length)})`);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (card) => {
          try {
            const cardRef = db.collection('card_database').doc(card.cardKey || card.id);
            
            // Fetch fresh market prices
            console.log(`   💰 Fetching prices for: ${card.name}...`);
            const marketPricesRaw = await fetchMarketPricesInternal(card);
            const marketPrices = transformPriceStructure(marketPricesRaw);
            
            // Fetch graded prices unless skipped
            let gradedPrices = card.gradedPrices || {};
            if (!skipGraded) {
              console.log(`   🏆 Fetching graded prices for: ${card.name}...`);
              try {
                const freshGradedPrices = await fetchAllGradedPrices(card);
                if (Object.keys(freshGradedPrices).length > 0) {
                  gradedPrices = {
                    ...freshGradedPrices,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                  };
                }
              } catch (gradedError) {
                console.warn(`   ⚠️ Graded price fetch failed for ${card.name}: ${gradedError.message}`);
              }
            }
            
            // Update the card document
            const updateData = {
              prices: marketPrices || card.prices || null,
              gradedPrices: gradedPrices,
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              updateCount: (card.updateCount || 0) + 1
            };
            
            await cardRef.update(updateData);
            console.log(`   ✅ Updated: ${card.name} #${card.number}`);
            
            return { success: true, name: card.name };
          } catch (error) {
            console.error(`   ❌ Failed: ${card.name} - ${error.message}`);
            return { success: false, name: card.name, error: error.message };
          }
        })
      );
      
      // Count results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          stats.updated++;
        } else {
          stats.failed++;
          const errorMsg = result.status === 'rejected' 
            ? result.reason?.message 
            : result.value?.error;
          if (stats.errors.length < 10) {
            stats.errors.push({ card: result.value?.name, error: errorMsg });
          }
        }
      });
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < cards.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n✨ Force update complete in ${duration.toFixed(2)}s`);
    console.log(`   Updated: ${stats.updated}, Failed: ${stats.failed}`);
    
    // Log to update_logs collection
    await db.collection('update_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'force_update_all',
      status: stats.failed === 0 ? 'success' : 'partial',
      duration: duration,
      stats: {
        totalCards: stats.total,
        cardsUpdated: stats.updated,
        cardsFailed: stats.failed,
        skipGraded: skipGraded
      },
      errors: stats.errors.length > 0 ? stats.errors : null
    });
    
    res.status(200).json({
      success: true,
      message: `Force update complete`,
      duration: `${duration.toFixed(2)}s`,
      stats: stats
    });
    
  } catch (error) {
    console.error('❌ Force update failed:', error);
    
    // Log failure
    await db.collection('update_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'force_update_all',
      status: 'error',
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      stats: stats
    });
  }
});

// ================================================================================
// JUSTTCG JAPANESE CARD ENDPOINTS
// ================================================================================

/**
 * Search Japanese Pokemon cards via JustTCG API
 * Usage: GET /searchJapaneseCards?q=Pikachu&limit=20
 * 
 * Smart search: Handles combined name+number queries like "gengar ex 088"
 * by searching name only and filtering by number locally
 */
exports.searchJapaneseCards = functions.runWith({
  timeoutSeconds: 30,
  memory: '256MB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const query = req.query.q || req.query.query || '';
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    
    if (!query) {
      res.status(400).json({ 
        success: false, 
        error: 'Query parameter "q" is required' 
      });
      return;
    }
    
    console.log(`🇯🇵 Searching Japanese cards for: "${query}"`);
    
    // Smart query parsing: separate name from number
    // Handles queries like "gengar ex 088" or "pikachu 025"
    const numberMatch = query.match(/(\d{2,4}(?:\/\d{2,4})?)/);
    const numberFilter = numberMatch ? numberMatch[1] : null;
    
    // Remove number from search query (JustTCG searches better by name only)
    let nameQuery = query;
    if (numberFilter) {
      nameQuery = query.replace(numberFilter, '').trim();
      // Clean up any double spaces
      nameQuery = nameQuery.replace(/\s+/g, ' ').trim();
    }
    
    console.log(`   Name query: "${nameQuery}", Number filter: "${numberFilter || 'none'}"`);
    
    // Search by name first
    let cards = await fetchJustTCGCards(nameQuery || query, 20);
    
    // If we have a number filter, apply it locally
    if (numberFilter && cards.length > 0) {
      const filteredCards = cards.filter(card => {
        const cardNumber = (card.number || '').toLowerCase();
        const cardName = (card.name || '').toLowerCase();
        const filterLower = numberFilter.toLowerCase();
        
        // Check if number appears in card number or name
        return cardNumber.includes(filterLower) || 
               cardName.includes(filterLower) ||
               cardNumber.includes(filterLower.replace('/', ''));
      });
      
      // If we found matches with the number filter, use those
      if (filteredCards.length > 0) {
        cards = filteredCards;
        console.log(`   Filtered to ${cards.length} cards matching number "${numberFilter}"`);
      } else {
        // No matches in first 20 results - try searching by number directly
        // JustTCG can search by card number too (e.g., "325" or "132")
        console.log(`   No matches in name results, trying number search...`);
        const numberCards = await fetchJustTCGCards(numberFilter, 20);
        
        if (numberCards.length > 0) {
          // Filter number results by name (to ensure it's the right Pokemon)
          const nameWords = nameQuery.toLowerCase().split(' ').filter(w => w.length > 2);
          const matchedByNumber = numberCards.filter(card => {
            const cardName = (card.name || '').toLowerCase();
            return nameWords.some(word => cardName.includes(word));
          });
          
          if (matchedByNumber.length > 0) {
            cards = matchedByNumber;
            console.log(`   Found ${cards.length} cards by number search`);
          } else {
            // Return number results anyway - user might find what they need
            cards = numberCards;
            console.log(`   Returning ${cards.length} cards from number search (name didn't match)`);
          }
        } else {
          console.log(`   No results from number search either, returning name results`);
        }
      }
    }
    
    // Transform to our format
    const transformedCards = cards.slice(0, limit).map(transformJustTCGCard);
    
    console.log(`✅ Found ${transformedCards.length} Japanese cards`);
    
    res.status(200).json({
      success: true,
      count: transformedCards.length,
      cards: transformedCards,
      source: 'justtcg',
      game: 'pokemon-japan',
      query: {
        original: query,
        name: nameQuery,
        numberFilter: numberFilter
      }
    });
    
  } catch (error) {
    console.error('❌ Japanese card search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Japanese card sets from JustTCG
 * Usage: GET /getJapaneseSets?limit=50
 */
exports.getJapaneseSets = functions.runWith({
  timeoutSeconds: 30,
  memory: '256MB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    
    const params = new URLSearchParams({
      game: 'pokemon-japan',
      limit: limit.toString()
    });
    
    const response = await fetch(`${JUSTTCG_API_URL}/sets?${params}`, {
      headers: {
        'x-api-key': JUSTTCG_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`JustTCG API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    res.status(200).json({
      success: true,
      count: data.data?.length || 0,
      total: data.meta?.total || 0,
      sets: data.data || [],
      source: 'justtcg'
    });
    
  } catch (error) {
    console.error('❌ Japanese sets fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Sync popular Japanese cards to our database (runs weekly)
 * This caches the most popular Japanese promos for faster access
 */
exports.syncJapaneseCards = functions.runWith({
  timeoutSeconds: 540,
  memory: '2GB'
}).pubsub
  .schedule('0 3 * * 0') // 3 AM UTC every Sunday
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🇯🇵 ========================================');
    console.log('🇯🇵 Starting weekly Japanese card sync...');
    console.log('🇯🇵 ========================================');
    
    const db = admin.firestore();
    const startTime = Date.now();
    const stats = { synced: 0, failed: 0, total: 0 };
    
    try {
      // Popular Japanese card searches to cache
      const searchTerms = [
        'Pikachu',
        'Charizard',
        'Mewtwo',
        'Eevee',
        'Mew',
        'Gengar',
        'Rayquaza',
        'Umbreon',
        'Espeon',
        'Lugia'
      ];
      
      for (const term of searchTerms) {
        console.log(`\n🔍 Syncing: ${term}`);
        
        try {
          // Respect rate limit (10 requests/minute)
          await new Promise(resolve => setTimeout(resolve, 6500));
          
          const cards = await fetchJustTCGCards(term, 20);
          stats.total += cards.length;
          
          for (const card of cards) {
            try {
              const transformed = transformJustTCGCard(card);
              const cardKey = `jp_${transformed.justTcgId}`;
              
              await db.collection('japanese_cards_cache').doc(cardKey).set({
                ...transformed,
                cachedAt: admin.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
              
              stats.synced++;
            } catch (err) {
              console.warn(`   ⚠️ Failed to cache: ${card.name}`, err.message);
              stats.failed++;
            }
          }
          
          console.log(`   ✅ Synced ${cards.length} cards for "${term}"`);
          
        } catch (error) {
          console.error(`   ❌ Failed to search "${term}":`, error.message);
        }
      }
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`\n✨ Japanese card sync complete in ${duration.toFixed(2)}s`);
      console.log(`   Synced: ${stats.synced}, Failed: ${stats.failed}, Total: ${stats.total}`);
      
      // Log success
      await db.collection('update_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'japanese_cards_sync',
        status: stats.failed === 0 ? 'success' : 'partial',
        duration: duration,
        stats: stats
      });
      
      return null;
      
    } catch (error) {
      console.error('❌ Japanese card sync failed:', error);
      
      await db.collection('update_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'japanese_cards_sync',
        status: 'error',
        error: error.message
      });
      
      return null;
    }
  });

/**
 * Manually trigger Japanese card sync (for testing)
 * Usage: GET /triggerJapaneseSync?token=rafchu-force-update-2024
 */
exports.triggerJapaneseSync = functions.runWith({
  timeoutSeconds: 540,
  memory: '2GB'
}).https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // Security check
  const token = req.query.token;
  if (token !== 'rafchu-force-update-2024') {
    res.status(403).json({ 
      success: false, 
      error: 'Unauthorized. Include token query parameter.' 
    });
    return;
  }
  
  const db = admin.firestore();
  const startTime = Date.now();
  const stats = { synced: 0, failed: 0, total: 0 };
  
  try {
    console.log('🇯🇵 Manual Japanese card sync triggered...');
    
    // Popular Japanese card searches
    const searchTerms = req.query.terms 
      ? req.query.terms.split(',') 
      : ['Pikachu', 'Charizard', 'Mewtwo', 'Eevee', 'Mew'];
    
    for (const term of searchTerms) {
      console.log(`\n🔍 Syncing: ${term}`);
      
      try {
        await new Promise(resolve => setTimeout(resolve, 6500));
        
        const cards = await fetchJustTCGCards(term.trim(), 20);
        stats.total += cards.length;
        
        for (const card of cards) {
          try {
            const transformed = transformJustTCGCard(card);
            const cardKey = `jp_${transformed.justTcgId}`;
            
            await db.collection('japanese_cards_cache').doc(cardKey).set({
              ...transformed,
              cachedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            stats.synced++;
          } catch (err) {
            stats.failed++;
          }
        }
        
        console.log(`   ✅ Synced ${cards.length} cards`);
        
      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
      }
    }
    
    const duration = (Date.now() - startTime) / 1000;
    
    // Log to update_logs
    await db.collection('update_logs').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'japanese_cards_sync_manual',
      status: stats.failed === 0 ? 'success' : 'partial',
      duration: duration,
      stats: stats
    });
    
    res.status(200).json({
      success: true,
      message: 'Japanese card sync complete',
      duration: `${duration.toFixed(2)}s`,
      stats: stats
    });
    
  } catch (error) {
    console.error('❌ Manual sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stats: stats
    });
  }
});

// ================================================================================
// SET CATALOG SYNC (Auto-update set abbreviations from CardMarket API)
// ================================================================================

/**
 * Words that should NOT be auto-generated as single-word abbreviations
 * because they collide with Pokemon names or common search terms.
 */
const SET_WORD_BLOCKLIST = new Set([
  'dark', 'light', 'fire', 'water', 'dragon', 'steel', 'poison', 'ice',
  'grass', 'electric', 'psychic', 'fighting', 'ghost', 'fairy', 'normal',
  'flying', 'ground', 'rock', 'bug', 'energy', 'trainer', 'supporter',
  'item', 'tool', 'stadium', 'ex', 'gx', 'vmax', 'vstar', 'v',
  'mega', 'break', 'legend', 'prime', 'lv', 'tag', 'ultra',
  'sun', 'moon', 'star', 'gold', 'silver', 'crystal',
]);

/**
 * Core logic for syncing the set catalog from CardMarket API to Firestore.
 * Paginates through /pokemon/episodes, generates abbreviations + related words,
 * and writes the result to system/set_catalog.
 */
async function syncSetCatalogCore() {
  const db = admin.firestore();
  const allSets = [];
  let page = 1;
  let hasMore = true;

  console.log('📚 Starting set catalog sync from CardMarket API...');

  // Paginate through all episodes (sets)
  while (hasMore) {
    const url = `https://${RAPIDAPI_HOST}/pokemon/episodes?page=${page}`;
    console.log(`  Fetching page ${page}: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      throw new Error(`CardMarket API error on page ${page}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const items = data?.data || data || [];

    if (!Array.isArray(items) || items.length === 0) {
      hasMore = false;
      break;
    }

    for (const item of items) {
      allSets.push({
        name: item.name || '',
        code: item.code || '',
        slug: item.slug || '',
        releasedAt: item.released_at || '',
        series: item.series?.name || '',
      });
    }

    console.log(`  Page ${page}: fetched ${items.length} sets (total so far: ${allSets.length})`);

    // CardMarket returns 20 per page; fewer means last page
    if (items.length < 20) {
      hasMore = false;
    } else {
      page++;
    }

    // Safety: never fetch more than 20 pages
    if (page > 20) {
      console.warn('  ⚠️ Safety limit reached (20 pages), stopping pagination');
      hasMore = false;
    }
  }

  console.log(`📦 Total sets fetched: ${allSets.length}`);

  // Generate abbreviations and related words
  const abbreviations = {};
  const relatedWordsSet = new Set();

  for (const set of allSets) {
    const name = set.name;
    if (!name) continue;

    const nameLower = name.toLowerCase().trim();
    const words = nameLower.split(/\s+/).filter(w => w.length > 0);

    // Full name as abbreviation (e.g., 'ascended heroes' -> 'Ascended Heroes')
    abbreviations[nameLower] = name;

    // First word as abbreviation, if not blocked and not too short
    if (words.length > 1 && words[0].length >= 3 && !SET_WORD_BLOCKLIST.has(words[0])) {
      // Only add if it doesn't overwrite an existing (more specific) mapping
      if (!abbreviations[words[0]]) {
        abbreviations[words[0]] = name;
      }
    }

    // Set code as abbreviation (e.g., 'ASC' -> 'Ascended Heroes')
    if (set.code && set.code.length >= 2) {
      const codeLower = set.code.toLowerCase();
      if (!abbreviations[codeLower]) {
        abbreviations[codeLower] = name;
      }
    }

    // Add individual words to related words set (skip blocked words)
    for (const word of words) {
      if (word.length >= 2 && !SET_WORD_BLOCKLIST.has(word)) {
        relatedWordsSet.add(word);
      }
    }

    // Also add series words as related words
    if (set.series) {
      const seriesWords = set.series.toLowerCase().split(/\s+/);
      for (const w of seriesWords) {
        if (w.length >= 2 && !SET_WORD_BLOCKLIST.has(w)) {
          relatedWordsSet.add(w);
        }
      }
    }
  }

  const relatedWords = Array.from(relatedWordsSet).sort();

  console.log(`🔤 Generated ${Object.keys(abbreviations).length} abbreviations and ${relatedWords.length} related words`);

  // Write to Firestore
  const catalog = {
    abbreviations,
    relatedWords,
    sets: allSets,
    lastSync: admin.firestore.FieldValue.serverTimestamp(),
    totalSets: allSets.length,
  };

  await db.collection('system').doc('set_catalog').set(catalog);
  console.log('✅ Set catalog written to Firestore: system/set_catalog');

  return {
    totalSets: allSets.length,
    abbreviationsCount: Object.keys(abbreviations).length,
    relatedWordsCount: relatedWords.length,
  };
}

/**
 * Scheduled function to sync set catalog weekly (Sunday 3AM UTC)
 */
exports.syncSetCatalog = functions.runWith({
  timeoutSeconds: 120,
  memory: '256MB',
}).pubsub
  .schedule('0 3 * * 0')
  .timeZone('UTC')
  .onRun(async (context) => {
    return await syncSetCatalogCore();
  });

/**
 * Manual trigger endpoint for set catalog sync
 * Usage: GET /triggerSetCatalogSync
 */
exports.triggerSetCatalogSync = functions.runWith({
  timeoutSeconds: 120,
  memory: '256MB',
}).https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    console.log('🚀 Manual set catalog sync triggered');
    const result = await syncSetCatalogCore();
    res.status(200).json({
      success: true,
      message: 'Set catalog synced successfully',
      result,
    });
  } catch (error) {
    console.error('❌ Set catalog sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
