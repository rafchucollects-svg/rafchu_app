import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';

/**
 * Shared hook for community images
 * Loads once per app session, updates on approval
 * Dramatically reduces Firestore reads
 */

let communityImagesCache = null;
let cacheTimestamp = null;
let fetchPromise = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useCommunityImages(db) {
  const [communityImages, setCommunityImages] = useState(communityImagesCache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCommunityImages = useCallback(async (forceRefresh = false) => {
    if (!db) return null;

    // Return cached data if still valid
    const now = Date.now();
    if (!forceRefresh && communityImagesCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('📸 Using cached community images');
      setCommunityImages(communityImagesCache);
      setLoading(false);
      return communityImagesCache;
    }

    // If already fetching, return the existing promise
    if (fetchPromise && !forceRefresh) {
      console.log('📸 Community images fetch already in progress');
      return fetchPromise;
    }

    setLoading(true);
    setError(null);

    fetchPromise = (async () => {
      try {
        console.log('📸 Fetching community images from Firestore... (lazy load)');
        const imagesRef = collection(db, "approvedCommunityImages");
        const snapshot = await getDocs(imagesRef);
        
        const imagesMap = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.cardId && data.imageUrl) {
            imagesMap[data.cardId] = data.imageUrl;
          }
        });
        
        // Update cache
        communityImagesCache = imagesMap;
        cacheTimestamp = Date.now();
        
        setCommunityImages(imagesMap);
        setLoading(false);
        
        console.log(`📸 Loaded ${Object.keys(imagesMap).length} community images`);
        return imagesMap;
      } catch (err) {
        console.error('Failed to load community images:', err);
        setError(err);
        setLoading(false);
        return {};
      } finally {
        fetchPromise = null;
      }
    })();

    return fetchPromise;
  }, [db]);

  // Lazy load: Only fetch when explicitly requested (removed auto-load on mount)

  // Helper to get image for a card
  const getImageForCard = useCallback((card) => {
    if (!card || communityImages === null) return null;
    
    // Try multiple ID formats
    const possibleIds = [
      card.id,
      card.cardId,
      `${card.name}-${card.set}-${card.number}`.replace(/\s+/g, '-').toLowerCase(),
      card.name,
      card.name?.toLowerCase()
    ].filter(Boolean);
    
    for (const id of possibleIds) {
      if (communityImages[id]) {
        return communityImages[id];
      }
    }
    
    return null;
  }, [communityImages]);

  // Helper to invalidate cache (call after approval)
  const invalidateCache = useCallback(() => {
    console.log('📸 Invalidating community images cache');
    communityImagesCache = null;
    cacheTimestamp = null;
    return loadCommunityImages(true);
  }, [loadCommunityImages]);

  return {
    communityImages,
    loading,
    error,
    getImageForCard,
    refresh: loadCommunityImages,
    invalidateCache
  };
}

// Helper to enrich cards with community images
export function enrichCardsWithImages(cards, communityImages) {
  if (!communityImages || !cards) return cards;
  
  return cards.map(card => {
    if (card.image) return card; // Already has image
    
    const possibleIds = [
      card.id,
      card.cardId,
      `${card.name}-${card.set}-${card.number}`.replace(/\s+/g, '-').toLowerCase(),
      card.name,
      card.name?.toLowerCase()
    ].filter(Boolean);
    
    for (const id of possibleIds) {
      if (communityImages[id]) {
        return { ...card, image: communityImages[id] };
      }
    }
    
    return card;
  });
}

