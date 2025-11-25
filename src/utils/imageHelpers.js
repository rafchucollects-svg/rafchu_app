import { getFirestore, doc, getDoc } from 'firebase/firestore';

/**
 * Image Helpers - Community image management
 */

/**
 * Get card image with community fallback
 * Priority: CardMarket image → Community image → null (placeholder)
 */
export async function getCardImage(card) {
  // 1. Try CardMarket/API image first
  if (card?.image) return card.image;
  
  // 2. Check for approved community image
  if (card?.id) {
    try {
      const communityImage = await getCommunityImage(card.id);
      if (communityImage) return communityImage;
    } catch (error) {
      console.error('Error fetching community image:', error);
    }
  }
  
  // 3. Return null (will show placeholder + upload button)
  return null;
}

/**
 * Fetch approved community image for a card
 */
export async function getCommunityImage(cardId) {
  if (!cardId) return null;
  
  try {
    const db = getFirestore();
    const docRef = doc(db, 'approvedCommunityImages', cardId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.imageUrl || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching community image:', error);
    return null;
  }
}

/**
 * Check if card has a missing image (needs community contribution)
 */
export function needsImage(card) {
  return !card?.image;
}

