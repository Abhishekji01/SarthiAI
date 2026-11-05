/**
 * "Near me" for opportunities: compares a listing's location with the places a student
 * chose (preferred locations, home state). Listings only state a city, so towns are mapped
 * to their city area and state here. An unknown town still matches by its exact name.
 */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** Other names and suburbs -> the city people would search for. */
const CITY_AREA = {
  bangalore: 'bengaluru', blr: 'bengaluru', soladevanahalli: 'bengaluru', whitefield: 'bengaluru', 'electronic city': 'bengaluru',
  bombay: 'mumbai', 'navi mumbai': 'mumbai', thane: 'mumbai',
  calcutta: 'kolkata', bidhannagar: 'kolkata', 'salt lake': 'kolkata', 'salt lake city': 'kolkata', 'new town': 'kolkata', howrah: 'kolkata',
  madras: 'chennai', poona: 'pune', pimpri: 'pune', trivandrum: 'thiruvananthapuram', mysore: 'mysuru',
  secunderabad: 'hyderabad', cochin: 'kochi', calicut: 'kozhikode', baroda: 'vadodara', vizag: 'visakhapatnam', mohali: 'chandigarh', panchkula: 'chandigarh',
  // Delhi NCR counts as one area.
  delhi: 'delhi ncr', 'new delhi': 'delhi ncr', ncr: 'delhi ncr', noida: 'delhi ncr', 'greater noida': 'delhi ncr',
  gurgaon: 'delhi ncr', gurugram: 'delhi ncr', ghaziabad: 'delhi ncr', faridabad: 'delhi ncr',
};

const STATE_CITIES = {
  'andhra pradesh': ['visakhapatnam', 'vijayawada', 'guntur', 'tirupati'],
  assam: ['guwahati', 'silchar'],
  bihar: ['patna', 'gaya'],
  chandigarh: ['chandigarh'],
  chhattisgarh: ['raipur', 'bhilai'],
  delhi: ['delhi ncr'],
  goa: ['panaji', 'margao'],
  gujarat: ['ahmedabad', 'surat', 'vadodara', 'rajkot', 'gandhinagar'],
  haryana: ['delhi ncr', 'ambala', 'karnal', 'kurukshetra', 'rohtak', 'hisar'],
  'himachal pradesh': ['hamirpur', 'shimla', 'mandi', 'solan'],
  'jammu and kashmir': ['srinagar', 'jammu'],
  jharkhand: ['ranchi', 'jamshedpur', 'dhanbad'],
  karnataka: ['bengaluru', 'mysuru', 'mangaluru', 'hubballi', 'belagavi', 'manipal'],
  kerala: ['kochi', 'thiruvananthapuram', 'kozhikode', 'thrissur', 'kollam'],
  'madhya pradesh': ['indore', 'bhopal', 'gwalior', 'jabalpur'],
  maharashtra: ['mumbai', 'pune', 'nagpur', 'nashik', 'aurangabad', 'kolhapur'],
  odisha: ['bhubaneswar', 'cuttack', 'rourkela'],
  punjab: ['ludhiana', 'patiala', 'amritsar', 'jalandhar', 'chandigarh', 'bathinda'],
  rajasthan: ['jaipur', 'jodhpur', 'udaipur', 'kota', 'pilani'],
  'tamil nadu': ['chennai', 'coimbatore', 'madurai', 'tiruchirappalli', 'salem', 'vellore', 'myladi', 'ksr kalvi nagar', 'namakkal'],
  telangana: ['hyderabad', 'warangal'],
  'uttar pradesh': ['delhi ncr', 'lucknow', 'kanpur', 'varanasi', 'prayagraj', 'agra', 'meerut'],
  uttarakhand: ['dehradun', 'roorkee', 'haridwar'],
  'west bengal': ['kolkata', 'durgapur', 'siliguri', 'kharagpur'],
};

const canonical = (s) => { const n = norm(s); return CITY_AREA[n] ?? n; };
const statesOf = (city) => Object.keys(STATE_CITIES).filter((st) => STATE_CITIES[st].includes(city));
const isState = (n) => Object.hasOwn(STATE_CITIES, n);

/** The student's chosen places, as typed (for messages), most specific first. */
export function userPlaces(user) {
  const p = user?.profile ?? {};
  return [...(p.preferredLocations ?? []), ...(p.homeState ? [p.homeState] : [])]
    .map((s) => String(s).trim())
    .filter((s) => s && !/^(remote|online|anywhere|india|pan india)$/i.test(s));
}

const isOnline = (o) => o.workMode === 'remote' || /^(online|remote)\b/i.test(o.location?.description ?? '');

function listingCity(o) {
  const raw = o.location?.city ?? o.location?.description?.split(',')[0] ?? '';
  const c = canonical(raw);
  return c === 'india' || c === 'online' ? '' : c;
}

export const PROXIMITY = { SAME_CITY: 3, SAME_STATE: 2, ONLINE: 1, ELSEWHERE: 0 };

/** How close a listing is to the student's places. Online counts ahead of far-away in-person events. */
export function proximity(o, places) {
  if (isOnline(o)) return PROXIMITY.ONLINE;
  const city = listingCity(o);
  const listingState = norm(o.location?.state);
  const states = new Set([...(city ? statesOf(city) : []), ...(listingState ? [listingState] : [])]);
  let best = o.location?.isNationwide ? PROXIMITY.ONLINE : PROXIMITY.ELSEWHERE;
  for (const place of places) {
    const n = canonical(place);
    if (isState(n) && n !== 'delhi' && n !== 'chandigarh') {
      if (states.has(n)) best = Math.max(best, PROXIMITY.SAME_STATE);
    } else if (city && n === city) {
      return PROXIMITY.SAME_CITY;
    } else if (statesOf(n).some((st) => states.has(st))) {
      best = Math.max(best, PROXIMITY.SAME_STATE);
    }
  }
  return best;
}

/** Location filter: "Bangalore" finds Bengaluru, "Karnataka" finds its cities. `strict` leaves out listings open everywhere. */
export function matchesPlace(o, text, { strict = false } = {}) {
  if (!strict && o.location?.isNationwide) return true;
  const n = canonical(text);
  if (!n) return true;
  const city = listingCity(o);
  if (city && city === n) return true;
  if (norm(o.location?.state) === n) return true;
  if (city && isState(n) && STATE_CITIES[n].includes(city)) return true;
  return n.length >= 3 && norm(o.location?.description).includes(n);
}

/** Display name for an in-person listing's city, or null when it doesn't name one. */
export function placeLabel(o) {
  if (isOnline(o)) return null;
  const city = listingCity(o);
  if (!city) return null;
  return city === 'delhi ncr' ? 'Delhi NCR' : city.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
