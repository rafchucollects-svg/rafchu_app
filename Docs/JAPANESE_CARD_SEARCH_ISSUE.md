# Japanese Card Search Issue

## Problem
Searching for Japanese cards (e.g., "Raichu Alolan Raichu GX 57") doesn't return the correct Japanese card. Instead, it returns irrelevant English cards.

## Root Cause
The card search API (`apiSearchCards` in `src/utils/apiHelpers.js`) is likely:
1. Not properly handling Japanese card names
2. Not searching Japanese set names
3. Not filtering by card number correctly for Japanese cards

## Example
- **Search Query:** "Raichu Alolan Raichu GX 57"
- **Expected:** Japanese version from a Japanese set with #57
- **Actual:** English results and irrelevant suggestions

## Solution Needed
1. **Update `apiSearchCards` function** to:
   - Accept a language parameter
   - Filter results by language/region
   - Prioritize exact card number matches

2. **Add Japanese set data** to the search:
   - Include Japanese set names in the search index
   - Map Japanese card numbers to their sets
   - Handle Romaji and Kanji card names

3. **Improve search relevance:**
   - When a card number is included in the search, prioritize exact matches
   - When searching for Japanese cards, filter out English results
   - Consider adding a language toggle to the search UI

## Priority
🔴 **HIGH** - This breaks the core functionality of finding and adding Japanese cards

## Status
⏸️ **Blocked** - Needs investigation of:
1. What data the current API provides for Japanese cards
2. How Pokemon Price Tracker API handles Japanese cards
3. Whether we need a separate Japanese card database/API









