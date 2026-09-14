import { describe, expect, it } from 'vitest';
import { readCardmarketProducts } from '../../companion/cardmarket/products';
import { rankCardmarketProducts } from './cardmarketProducts';

// Public card identities audited in Inventory on 14 September 2026. These are
// product-page fixtures, not a claim that a live Chrome search completed.
// Duplicated inventory copies share the same product identity (21 across 24 entries).
const cases = [
  ['Blastoise', 'Expedition Base Set', '4', 'Blastoise', 'Expedition Base Set', 'EX 4', 'Expedition-Base-Set/Blastoise-EX4'],
  ['Charizard', 'EX Crystal Guardians', '4', 'Charizard δ Delta Species', 'EX Crystal Guardians', 'CG 4', 'EX-Crystal-Guardians/Charizard-Delta-Species-CG4'],
  ['Reshiram & Charizard-GX', 'SM Black Star Promos', 'SM201', 'Reshiram & Charizard GX', 'SM Black Star Promos', 'SM 201', 'SM-Black-Star-Promos/Reshiram-Charizard-GX-V1-SM201'],
  ['Charizard 1st Edition', 'Japanese Expedition', '103', 'Charizard', 'Base Expansion Pack', 'EC1 103', 'Base-Expansion-Pack/Charizard-V2-EC1103'],
  ['Jolteon', 'EX Delta Species', '7', 'Jolteon δ Delta Species', 'EX Delta Species', 'DS 7', 'EX-Delta-Species/Jolteon-Delta-Species-DS7'],
  ['Shining Steelix', 'Neo Destiny', '112', 'Shining Steelix', 'Neo Destiny', 'NDE 112', 'Neo-Destiny/Shining-Steelix-NDE112'],
  ["Ethan's Ho-Oh ex", 'Destined Rivals', '230', "Ethan's Ho-Oh ex", 'Destined Rivals', 'DRI 230', 'Destined-Rivals/Ethans-Ho-Oh-ex-V3-DRI230'],
  ['Mega Charizard X ex', 'Phantasmal Flames', '125', 'Mega Charizard X ex', 'Phantasmal Flames', 'PFL 125', 'Phantasmal-Flames/Mega-Charizard-X-ex-V3-PFL125'],
  ['Shining Gyarados', 'Neo Revelation', '65', 'Shining Gyarados', 'Neo Revelation', 'NR 65', 'Neo-Revelation/Shining-Gyarados-NR65'],
  ['Charizard & Braixen-GX', 'SM Black Star Promos', 'SM230', 'Charizard & Braixen GX', 'SM Black Star Promos', 'SM 230', 'SM-Black-Star-Promos/Charizard-Braixen-GX-SM230'],
  ["Team Rocket's Nidoking ex", 'Destined Rivals', '233', "Team Rocket's Nidoking ex", 'Destined Rivals', 'DRI 233', 'Destined-Rivals/Team-Rockets-Nidoking-ex-V3-DRI233'],
  ['Dark Vaporeon', 'Legendary Collection', '9', 'Dark Vaporeon', 'Legendary Collection', 'LC 9', 'Legendary-Collection/Dark-Vaporeon-LC9'],
  ['Mewtwo', 'Legendary Collection', '29', 'Mewtwo', 'Legendary Collection', 'LC 29', 'Legendary-Collection/Mewtwo-V1-LC29'],
  ['Lugia ex', 'EX Unseen Forces', '105', 'Lugia ex', 'EX Unseen Forces', 'UF 105', 'EX-Unseen-Forces/Lugia-ex-UF105'],
  ['Charizard', 'Sun & Moon SM Black Star Promos', 'SM226', 'Charizard', 'SM Black Star Promos', 'SM 226', 'SM-Black-Star-Promos/Charizard-V2-SM226'],
  ['Mew ★ δ', 'EX Dragon Frontiers', '101', 'Mew Gold Star δ Delta Species', 'EX Dragon Frontiers', 'DF 101', 'EX-Dragon-Frontiers/Mew-Gold-Star-Delta-Species-DF101'],
  ['Jolteon', 'EX Unseen Forces', '8', 'Jolteon', 'EX Unseen Forces', 'UF 8', 'EX-Unseen-Forces/Jolteon-UF8'],
  ['Latias-EX', 'Black & White Plasma Freeze', '112', 'Latias EX', 'Plasma Freeze', 'PLF 112', 'Plasma-Freeze/Latias-EX-PLF112'],
  ['Eevee', 'Black & White BW Black Star Promos', 'BW97', 'Eevee', 'BW Black Star Promos', 'BW 97', 'BW-Black-Star-Promos/Eevee-V2-BWBW97'],
  ['Umbreon', 'E-Card Aquapolis', 'H29', 'Umbreon', 'Aquapolis', 'AQ H29', 'Aquapolis/Umbreon-V1-AQH29'],
  ['Pikachu & Zekrom-GX', 'Sun & Moon Team Up', '33', 'Pikachu & Zekrom GX', 'Team Up', 'TEU 33', 'Team-Up/Pikachu-Zekrom-GX-V1-TEU33'],
];

describe('current manual single identities through the companion reader', () => {
  it.each(cases)('reads and matches %s from %s #%s while rejecting other identities', (name, set, number, productName, productSet, reference, path) => {
    const item = { name, set, number };
    const url = `https://www.cardmarket.com/en/Pokemon/Products/Singles/${path}`;
    document.body.innerHTML = '<h1></h1><form id="FilterForm"></form>';
    document.querySelector('h1').textContent = `${productName} (${reference}) ${productSet} - Singles`;
    const result = readCardmarketProducts(document, url, item);
    expect(rankCardmarketProducts(item, result.candidates)).toMatchObject([{ productUrl: url }]);
    expect(rankCardmarketProducts({ ...item, number: '99999' }, result.candidates)).toEqual([]);
    expect(rankCardmarketProducts({ ...item, name: 'Other Pokémon' }, result.candidates)).toEqual([]);
    expect(rankCardmarketProducts({ ...item, set: 'Other Expansion' }, result.candidates)).toEqual([]);
  });
});
