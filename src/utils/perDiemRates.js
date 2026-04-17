/**
 * Finnish per diem (päiväraha) rates for 2026.
 * Source: Vero.fi decision VH/6575/00.01.00/2025
 * https://www.vero.fi/en/detailed-guidance/decisions/47405/
 */

export const DOMESTIC_RATES = {
  full: 54,    // > 10 hours
  partial: 25, // > 6 hours
};

export const INTERNATIONAL_RATES = {
  "Afghanistan": 58, "Albania": 93, "Algeria": 79, "Andorra": 66, "Angola": 80,
  "Antigua and Barbuda": 92, "Argentina": 43, "Armenia": 59, "Aruba": 66,
  "Australia": 72, "Austria": 85, "Azerbaijan": 69, "Azores": 72,
  "Bahamas": 85, "Bahrain": 73, "Bangladesh": 57, "Barbados": 75, "Belarus": 49,
  "Belgium": 81, "Belize": 50, "Benin": 48, "Bermuda": 86, "Bhutan": 35,
  "Bolivia": 57, "Bosnia and Herzegovina": 64, "Botswana": 44, "Brazil": 72,
  "Brunei": 43, "Bulgaria": 69, "Burkina Faso": 32, "Burundi": 62,
  "Cambodia": 65, "Cameroon": 65, "Canada": 76, "Canary Islands": 75,
  "Cape Verde": 46, "Central African Republic": 104, "Chad": 50, "Chile": 52,
  "China": 69, "Hong Kong": 79, "Colombia": 63, "Comoros": 48,
  "Congo (Brazzaville)": 70, "Congo (Kinshasa)": 58, "Cook Islands": 67,
  "Costa Rica": 62, "Côte d'Ivoire": 86, "Croatia": 74, "Cuba": 70,
  "Curaçao": 55, "Cyprus": 65, "Czech Republic": 94, "Czechia": 94,
  "Denmark": 82, "Djibouti": 79, "Dominica": 59, "Dominican Republic": 48,
  "East Timor": 43, "Ecuador": 59, "Egypt": 55, "El Salvador": 55,
  "Eritrea": 100, "Estonia": 82, "Eswatini": 39, "Ethiopia": 39,
  "Faroe Islands": 64, "Fiji": 50, "Finland": 54,
  "France": 80, "Gabon": 97, "Gambia": 43, "Georgia": 46,
  "Germany": 78, "Ghana": 49, "Greece": 72, "Greenland": 65, "Grenada": 70,
  "Guadeloupe": 55, "Guatemala": 75, "Guinea": 83, "Guinea-Bissau": 46,
  "Guyana": 50, "Haiti": 98, "Honduras": 55, "Hungary": 72, "Iceland": 102,
  "India": 57, "Indonesia": 52, "Iran": 134, "Iraq": 67, "Ireland": 81,
  "Israel": 97, "Italy": 78, "Jamaica": 59, "Japan": 64, "Jordan": 85,
  "Kazakhstan": 57, "Kenya": 79, "North Korea": 64, "South Korea": 78,
  "Kosovo": 62, "Kuwait": 82, "Kyrgyzstan": 43, "Laos": 35, "Latvia": 76,
  "Lebanon": 103, "Lesotho": 37, "Liberia": 61, "Libya": 44,
  "Liechtenstein": 81, "Lithuania": 75, "Luxembourg": 81, "Madagascar": 48,
  "Madeira": 71, "Malawi": 75, "Malaysia": 53, "Maldives": 66, "Mali": 53,
  "Malta": 74, "Marshall Islands": 67, "Martinique": 57, "Mauritania": 46,
  "Mauritius": 49, "Mexico": 74, "Micronesia": 60, "Moldova": 81,
  "Monaco": 92, "Mongolia": 31, "Montenegro": 71, "Morocco": 75,
  "Mozambique": 52, "Myanmar": 85, "Namibia": 38, "Nepal": 47,
  "Netherlands": 88, "New Zealand": 72, "Nicaragua": 48, "Niger": 43,
  "Nigeria": 32, "North Macedonia": 69, "Norway": 72, "Oman": 69,
  "Pakistan": 32, "Palau": 104, "Palestine": 120, "Panama": 57,
  "Papua New Guinea": 62, "Paraguay": 36, "Peru": 51, "Philippines": 66,
  "Poland": 84, "Portugal": 74, "Puerto Rico": 69, "Qatar": 71,
  "Romania": 74, "Russia": 87, "Moscow": 108, "St. Petersburg": 100,
  "Rwanda": 31, "Saint Kitts and Nevis": 62, "Saint Lucia": 80,
  "Saint Vincent and the Grenadines": 84, "Samoa": 58, "San Marino": 61,
  "São Tomé and Príncipe": 132, "Saudi Arabia": 75, "Senegal": 58,
  "Serbia": 82, "Seychelles": 71, "Sierra Leone": 58, "Singapore": 79,
  "Slovakia": 85, "Slovenia": 75, "Solomon Islands": 64, "Somalia": 87,
  "South Africa": 53, "South Sudan": 134, "Spain": 78, "Sri Lanka": 29,
  "Sudan": 134, "Suriname": 85, "Sweden": 70, "Switzerland": 95,
  "Syria": 86, "Tajikistan": 40, "Taiwan": 69, "Tanzania": 51,
  "Thailand": 63, "Togo": 63, "Tonga": 62, "Trinidad and Tobago": 78,
  "Tunisia": 69, "Turkey": 43, "Istanbul": 44, "Turkmenistan": 86,
  "Uganda": 51, "Ukraine": 62, "United Arab Emirates": 69, "UAE": 69,
  "United Kingdom": 84, "UK": 84, "London": 89, "Edinburgh": 89,
  "United States": 86, "USA": 86, "US": 86,
  "New York": 93, "Los Angeles": 93, "Washington": 93,
  "Uruguay": 56, "Uzbekistan": 34, "Vanuatu": 69, "Venezuela": 107,
  "Vietnam": 63, "Virgin Islands": 61, "Yemen": 109, "Zambia": 58,
  "Zimbabwe": 122,
};

const DEFAULT_INTERNATIONAL_RATE = 52;

export function getPerDiemRate(country) {
  if (!country) return DOMESTIC_RATES.full;
  const normalized = country.trim();
  if (normalized.toLowerCase() === "finland") return DOMESTIC_RATES.full;

  const exact = INTERNATIONAL_RATES[normalized];
  if (exact) return exact;

  const lower = normalized.toLowerCase();
  for (const [key, val] of Object.entries(INTERNATIONAL_RATES)) {
    if (key.toLowerCase() === lower) return val;
  }

  return DEFAULT_INTERNATIONAL_RATE;
}

/**
 * Calculate per diem with support for partial days and meal deductions.
 * Finnish rules (Vero):
 *   Domestic: >10h = full (€54), >6h = partial (€25), ≤6h = 0
 *   International: full day rate per country (partial not applied for foreign travel)
 *   Meal deduction: each free meal reduces the day's allowance by 50%
 *
 * @param {string} country
 * @param {string} startDate - "YYYY-MM-DD"
 * @param {string} endDate - "YYYY-MM-DD"
 * @param {Object} [options]
 * @param {number} [options.travelHoursFirstDay] - hours traveled on departure day
 * @param {number} [options.travelHoursLastDay] - hours traveled on return day
 * @param {number} [options.freeMeals] - total free meals across the trip (each halves one day)
 */
export function calculatePerDiem(country, startDate, endDate, options = {}) {
  if (!startDate || !endDate) return { days: 0, rate: 0, total: 0, isInternational: false, fullDays: 0, partialDays: 0, mealDeduction: 0 };

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T23:59:59");
  const diffMs = end - start;
  const calendarDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  const isInternational = country && country.trim().toLowerCase() !== "finland";
  const fullRate = getPerDiemRate(country);

  let fullDays = 0;
  let partialDays = 0;
  let total = 0;

  if (isInternational) {
    fullDays = calendarDays;
    total = calendarDays * fullRate;
  } else {
    if (calendarDays === 1) {
      const hours = options.travelHoursFirstDay ?? 11;
      if (hours > 10) {
        fullDays = 1;
        total = DOMESTIC_RATES.full;
      } else if (hours > 6) {
        partialDays = 1;
        total = DOMESTIC_RATES.partial;
      }
    } else {
      const middleDays = Math.max(0, calendarDays - 2);
      fullDays = middleDays;
      total = middleDays * DOMESTIC_RATES.full;

      const firstHours = options.travelHoursFirstDay ?? 11;
      if (firstHours > 10) { fullDays++; total += DOMESTIC_RATES.full; }
      else if (firstHours > 6) { partialDays++; total += DOMESTIC_RATES.partial; }

      const lastHours = options.travelHoursLastDay ?? 11;
      if (lastHours > 10) { fullDays++; total += DOMESTIC_RATES.full; }
      else if (lastHours > 6) { partialDays++; total += DOMESTIC_RATES.partial; }
    }
  }

  const freeMeals = options.freeMeals || 0;
  const mealDeduction = freeMeals > 0 ? Math.min(total * 0.5, freeMeals * fullRate * 0.5) : 0;
  total = Math.max(0, total - mealDeduction);

  return {
    days: calendarDays,
    fullDays,
    partialDays,
    rate: fullRate,
    partialRate: isInternational ? fullRate : DOMESTIC_RATES.partial,
    total: Math.round(total * 100) / 100,
    mealDeduction: Math.round(mealDeduction * 100) / 100,
    isInternational,
  };
}

export function getCountryList() {
  const seen = new Set();
  const countries = [];

  for (const key of Object.keys(INTERNATIONAL_RATES)) {
    if (["Hong Kong", "Moscow", "St. Petersburg", "Istanbul", "London",
         "Edinburgh", "New York", "Los Angeles", "Washington",
         "UK", "UAE", "USA", "US", "Czechia"].includes(key)) continue;
    if (!seen.has(key)) {
      seen.add(key);
      countries.push(key);
    }
  }

  countries.sort((a, b) => a.localeCompare(b));
  countries.unshift("Finland");
  return countries;
}
