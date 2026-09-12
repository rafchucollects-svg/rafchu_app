import { createCardmarketBinding } from '../../src/utils/cardmarketSync.js';
export const examples = [
  { entryId: 'test-jolteon', name: 'Jolteon', set: 'EX Unseen Forces', number: '8', language: 'English', condition: 'LP', isReverseHolo: true,
    productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8', finish: 'reverse', firstEdition: false, cmCondition: 'EX' },
  { entryId: 'test-charizard', name: 'Charizard 1st Edition', set: 'Japanese Expedition', number: '103', language: 'Japanese', condition: 'NM', isFirstEdition: true,
    productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Expansion-Pack/Charizard-V2-EC1103', finish: 'non-reverse', firstEdition: true, cmCondition: 'NM' },
  { entryId: 'test-vaporeon', name: 'Dark Vaporeon', set: 'Legendary Collection', number: '9', language: 'English', condition: 'MP', isReverseHolo: true,
    productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Legendary-Collection/Dark-Vaporeon-LC9', finish: 'reverse', firstEdition: false, cmCondition: 'GD' },
].map(item => ({ ...item, cardmarketBinding: createCardmarketBinding(item, { productUrl: item.productUrl, confirmed: true, language: item.language, condition: item.cmCondition, finish: item.finish, firstEdition: item.firstEdition }) }));
