// The 25 districts of Sri Lanka, and the spellings each data source uses for them.
// DCS paddy statistics (yield) and ERA5 climate (suitability) disagree on a few names, as do users.
const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha', 'Hambantota', 'Jaffna',
  'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala',
  'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

const ALIASES = {
  killinochchi: 'Kilinochchi', kilinochi: 'Kilinochchi',
  mullativu: 'Mullaitivu', mulaitivu: 'Mullaitivu',
  moneragala: 'Monaragala',
  nuweraeliya: 'Nuwara Eliya',
  trincomale: 'Trincomalee',
  kegalla: 'Kegalle',
  ratnapure: 'Ratnapura',
};

const BY_KEY = Object.fromEntries(DISTRICTS.map((d) => [key(d), d]));

/** Canonical display name ('Nuwara Eliya') for any spelling, or null. */
function canonical(name) {
  const k = key(name);
  return BY_KEY[k] || ALIASES[k] || null;
}

// Names as the AI service's data sources spell them.
const YIELD_NAME = { Kilinochchi: 'KILLINOCHCHI', Mullaitivu: 'MULLATIVU' }; // DCS
const CLIMATE_NAME = { Monaragala: 'MONERAGALA' }; // ERA5 district file

const forYield = (name) => {
  const c = canonical(name);
  return c ? (YIELD_NAME[c] || c.toUpperCase()) : String(name || '').trim();
};
const forClimate = (name) => {
  const c = canonical(name);
  return c ? (CLIMATE_NAME[c] || c.toUpperCase()) : String(name || '').trim();
};
/** Display name for a name coming back from the AI service. */
const display = (name) => canonical(name) || String(name || '').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());

module.exports = { DISTRICTS, canonical, forYield, forClimate, display };
