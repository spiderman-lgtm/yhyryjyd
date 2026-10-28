import 'server-only';
import { askAI } from './viasocket';
import { liveCoupons } from './storecoupons';

// Bus, train and flight fares between Indian cities: each booking site's search opened with the trip filled in,
// and the current fares found by viaSocket AI web search (cached 3 hours).

export type Mode = 'bus' | 'train' | 'flight';
export interface City {
  name: string;
  air?: string; // airport IATA code
  rail?: string; // main railway station code
}

export const CITIES: City[] = [
  { name: 'Indore', air: 'IDR', rail: 'INDB' }, { name: 'Bhopal', air: 'BHO', rail: 'BPL' }, { name: 'Ujjain', rail: 'UJN' },
  { name: 'Delhi', air: 'DEL', rail: 'NDLS' }, { name: 'Mumbai', air: 'BOM', rail: 'MMCT' }, { name: 'Bengaluru', air: 'BLR', rail: 'SBC' },
  { name: 'Chennai', air: 'MAA', rail: 'MAS' }, { name: 'Kolkata', air: 'CCU', rail: 'HWH' }, { name: 'Hyderabad', air: 'HYD', rail: 'SC' },
  { name: 'Pune', air: 'PNQ', rail: 'PUNE' }, { name: 'Ahmedabad', air: 'AMD', rail: 'ADI' }, { name: 'Jaipur', air: 'JAI', rail: 'JP' },
  { name: 'Lucknow', air: 'LKO', rail: 'LKO' }, { name: 'Goa', air: 'GOI', rail: 'MAO' }, { name: 'Kochi', air: 'COK', rail: 'ERS' },
  { name: 'Chandigarh', air: 'IXC', rail: 'CDG' }, { name: 'Patna', air: 'PAT', rail: 'PNBE' }, { name: 'Varanasi', air: 'VNS', rail: 'BSB' },
  { name: 'Nagpur', air: 'NAG', rail: 'NGP' }, { name: 'Udaipur', air: 'UDR', rail: 'UDZ' }, { name: 'Gwalior', air: 'GWL', rail: 'GWL' },
  { name: 'Jabalpur', air: 'JLR', rail: 'JBP' }, { name: 'Surat', air: 'STV', rail: 'ST' }, { name: 'Vadodara', air: 'BDQ', rail: 'BRC' },
  { name: 'Amritsar', air: 'ATQ', rail: 'ASR' }, { name: 'Dehradun', air: 'DED', rail: 'DDN' }, { name: 'Guwahati', air: 'GAU', rail: 'GHY' },
  { name: 'Bhubaneswar', air: 'BBI', rail: 'BBS' }, { name: 'Raipur', air: 'RPR', rail: 'R' }, { name: 'Visakhapatnam', air: 'VTZ', rail: 'VSKP' },
  { name: 'Coimbatore', air: 'CJB', rail: 'CBE' }, { name: 'Agra', air: 'AGR', rail: 'AGC' }, { name: 'Kanpur', air: 'KNU', rail: 'CNB' },
  { name: 'Srinagar', air: 'SXR' }, { name: 'Ranchi', air: 'IXR', rail: 'RNC' }, { name: 'Mysuru', air: 'MYQ', rail: 'MYS' },
  { name: 'Madurai', air: 'IXM', rail: 'MDU' }, { name: 'Thiruvananthapuram', air: 'TRV', rail: 'TVC' }, { name: 'Nashik', air: 'ISK', rail: 'NK' },
  { name: 'Rajkot', air: 'HSR', rail: 'RJT' }, { name: 'Jodhpur', air: 'JDH', rail: 'JU' }, { name: 'Mangaluru', air: 'IXE', rail: 'MAQ' },
];

export const findCity = (name: string) => {
  const n = name.trim().toLowerCase().replace(/^new\s+/, '').replace('bangalore', 'bengaluru').replace('bombay', 'mumbai').replace('calcutta', 'kolkata');
  return CITIES.find((c) => c.name.toLowerCase() === n) ?? null;
};

export interface Site {
  name: string;
  domain: string;
  url: string;
}

// Each booking site's own search, with the trip filled in where the site's address takes it.
export function sites(mode: Mode, from: City, to: City, date: string): Site[] {
  const [y, m, d] = date.split('-');
  const slug = (c: City) => c.name.toLowerCase().replace(/\s+/g, '-');
  if (mode === 'flight') {
    const a = from.air!, b = to.air!;
    return [
      { name: 'Google Flights', domain: 'google.com', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`one way flights from ${a} to ${b} on ${date}`)}&curr=INR` },
      { name: 'MakeMyTrip', domain: 'makemytrip.com', url: `https://www.makemytrip.com/flight/search?itinerary=${a}-${b}-${d}/${m}/${y}&tripType=O&paxType=A-1_C-0_I-0&intl=false&cabinClass=E` },
      { name: 'ixigo', domain: 'ixigo.com', url: `https://www.ixigo.com/search/result/flight?from=${a}&to=${b}&date=${d}${m}${y}&adults=1&children=0&infants=0&class=e` },
      { name: 'Cleartrip', domain: 'cleartrip.com', url: `https://www.cleartrip.com/flights/results?adults=1&childs=0&infants=0&class=Economy&depart_date=${d}/${m}/${y}&from=${a}&to=${b}&intl=n` },
      { name: 'Goibibo', domain: 'goibibo.com', url: 'https://www.goibibo.com/flights/' },
      { name: 'EaseMyTrip', domain: 'easemytrip.com', url: 'https://www.easemytrip.com/flights.html' },
    ];
  }
  if (mode === 'train') {
    const a = from.rail!, b = to.rail!;
    return [
      { name: 'IRCTC', domain: 'irctc.co.in', url: 'https://www.irctc.co.in/nget/train-search' },
      { name: 'ixigo Trains', domain: 'ixigo.com', url: `https://www.ixigo.com/search/result/train/${a}/${b}/${d}${m}${y}//1/0/0/0/ALL` },
      { name: 'ConfirmTkt', domain: 'confirmtkt.com', url: 'https://www.confirmtkt.com/' },
      { name: 'RailYatri', domain: 'railyatri.in', url: `https://www.railyatri.in/booking/trains-between-stations?from_code=${a}&to_code=${b}&journey_date=${d}-${m}-${y}` },
      { name: 'MakeMyTrip Trains', domain: 'makemytrip.com', url: 'https://www.makemytrip.com/railways/' },
    ];
  }
  return [
    { name: 'redBus', domain: 'redbus.in', url: `https://www.redbus.in/bus-tickets/${slug(from)}-to-${slug(to)}` },
    { name: 'AbhiBus', domain: 'abhibus.com', url: 'https://www.abhibus.com/' },
    { name: 'MakeMyTrip Bus', domain: 'makemytrip.com', url: 'https://www.makemytrip.com/bus-tickets/' },
    { name: 'ixigo Bus', domain: 'ixigo.com', url: 'https://www.ixigo.com/buses' },
    { name: 'Paytm Bus', domain: 'paytm.com', url: 'https://tickets.paytm.com/bus/' },
  ];
}

export interface TravelOption {
  name: string; // airline + flight no., train name + no., or bus operator
  detail: string; // class / bus type / stops
  depart: string;
  arrive: string;
  duration: string;
  price: number;
  site: string;
  url: string;
  // After the best coupon or offer on that site: the price to pay and how.
  final?: number;
  coupon?: { code: string | null; text: string; off: number };
}

// A coupon or bank offer on a booking site.
export interface SiteOffer {
  site: string;
  code: string | null;
  text: string;
  source: 'dealradar' | 'web';
}

// Rupees an offer takes off a fare: "₹200 off", "Flat ₹150 cashback", "12% off up to ₹300".
export function offAmount(text: string, price: number): number {
  const t = text.replace(/(?:\bINR|\bRs\.?)\s*(?=\d)/g, '₹');
  const pct = t.match(/(\d{1,2})\s*%[^₹]{0,40}?(?:up\s*to|upto|max(?:imum)?)\s*₹\s?([\d,]+)/i);
  if (pct) return Math.min((price * Number(pct[1])) / 100, Number(pct[2].replace(/,/g, '')));
  // "Up to ₹250 off" is only a ceiling, so it is not counted as a sure saving.
  const flat = t.match(/(up\s*to\s*)?₹\s?([\d,]+)\s*(?:instant\s+)?(?:off|discount|cashback)/i);
  if (flat?.[1]) return 0;
  if (flat) return Number(flat[2].replace(/,/g, ''));
  const bare = t.match(/(\d{1,2})\s*%\s*(?:off|discount)/i);
  return bare ? (price * Number(bare[1])) / 100 : 0;
}

// Minimum-fare rules ("on bookings above ₹999") are honoured when the text states one.
function applies(text: string, price: number) {
  // First-booking and new-user offers are listed but not counted: most shoppers can't use them.
  if (/first (?:booking|ride|trip|order)|new users?/i.test(text)) return false;
  const min = text.match(/(?:above|over|min(?:imum)?(?:\s+(?:order|booking|fare))?\s*(?:of)?)\s*₹\s?([\d,]+)/i);
  return !min || price >= Number(min[1].replace(/,/g, ''));
}

export function withCoupons(options: TravelOption[], offers: SiteOffer[]): TravelOption[] {
  return options
    .map((o) => {
      const mine = offers.filter((x) => o.site.toLowerCase().includes(x.site.toLowerCase().split(' ')[0]) || x.site.toLowerCase().includes(o.site.toLowerCase().split(' ')[0]));
      const best = mine
        .filter((x) => applies(x.text, o.price))
        .map((x) => ({ x, off: Math.round(Math.min(offAmount(x.text, o.price), o.price * 0.5)) }))
        .sort((a, b) => b.off - a.off)[0];
      return best && best.off > 0 ? { ...o, final: o.price - best.off, coupon: { code: best.x.code, text: best.x.text, off: best.off } } : { ...o, final: o.price };
    })
    .sort((a, b) => (a.final ?? a.price) - (b.final ?? b.price));
}

// Coupons the owner added on DealRadar for these sites (Admin → Coupons, e.g. store "redBus").
export function ownOffers(siteNames: string[]): SiteOffer[] {
  const names = siteNames.map((n) => n.toLowerCase().split(' ')[0]);
  return liveCoupons()
    .filter((c) => names.some((n) => c.store.toLowerCase().includes(n)))
    .map((c) => ({ site: c.store, code: c.code, text: [c.discount_text, c.title, c.description].filter(Boolean).join(' — ').slice(0, 160), source: 'dealradar' as const }));
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['options', 'offers'],
  properties: {
    offers: {
      type: 'array',
      maxItems: 10,
      description: 'coupon codes and bank/wallet offers currently valid on these booking sites for this kind of ticket',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['site', 'code', 'text'],
        properties: {
          site: { type: 'string' },
          code: { type: ['string', 'null'], description: 'coupon code, or null for an automatic/bank offer' },
          text: { type: 'string', description: 'the offer exactly as stated, e.g. "Flat ₹250 off on bus tickets above ₹999" or "12% off up to ₹300 with HDFC cards"' },
        },
      },
    },
    options: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'detail', 'depart', 'arrive', 'duration', 'price', 'site', 'url'],
        properties: {
          name: { type: 'string', description: 'airline and flight number, train name and number, or bus operator' },
          detail: { type: 'string', description: 'class (e.g. Sleeper, 3A), bus type (AC Sleeper) or stops (Non-stop)' },
          depart: { type: 'string', description: 'departure time HH:MM' },
          arrive: { type: 'string', description: 'arrival time HH:MM' },
          duration: { type: 'string', description: 'e.g. 1h 25m' },
          price: { type: 'number', description: 'fare in INR for one adult' },
          site: { type: 'string', description: 'the booking site where this fare was seen' },
          url: { type: 'string', description: 'the page where this fare was seen' },
        },
      },
    },
  },
};

const WORD: Record<Mode, string> = { flight: 'flights', train: 'trains (fare per class)', bus: 'buses' };
const cache = new Map<string, { at: number; options: TravelOption[]; offers: SiteOffer[] }>();
const inFlight = new Map<string, Promise<{ options: TravelOption[]; offers: SiteOffer[] }>>();

export async function liveFares(mode: Mode, from: City, to: City, date: string): Promise<{ options: TravelOption[]; offers: SiteOffer[] }> {
  const key = `${mode}|${from.name}|${to.name}|${date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3 * 3600_000) return hit;
  let p = inFlight.get(key);
  if (!p) {
    p = (async () => {
      const r = await askAI<{ options: TravelOption[]; offers: { site: string; code: string | null; text: string }[] }>({
        thread_id: `travel-${mode}-${Date.now()}`,
        prompt:
          `You compare ${WORD[mode]} in India. Search the booking sites (for flights: Google Flights, MakeMyTrip, ixigo, Cleartrip, Goibibo; ` +
          'for trains: IRCTC, ixigo, ConfirmTkt, RailYatri; for buses: redBus, AbhiBus, MakeMyTrip, ixigo) for the trip and date given. ' +
          'Return the options with the fares shown today, cheapest first, and the coupon codes and bank/wallet offers each site has ' +
          'right now for this kind of ticket. Only include a fare or offer you saw on a page; never guess or invent codes.',
        message: `From: ${from.name}${mode === 'flight' ? ` (${from.air})` : mode === 'train' ? ` (${from.rail})` : ''}\nTo: ${to.name}${mode === 'flight' ? ` (${to.air})` : mode === 'train' ? ` (${to.rail})` : ''}\nDate: ${date}`,
        schemaName: 'travel',
        schema: SCHEMA,
      });
      const options = (r?.options || [])
        .filter((o) => o.price > 50 && o.price < 200000 && o.name && /^https?:\/\//.test(o.url))
        .map((o) => ({ ...o, name: o.name.slice(0, 80), detail: o.detail.slice(0, 60), site: o.site.slice(0, 30) }))
        .sort((a, b) => a.price - b.price);
      const offers: SiteOffer[] = (r?.offers || [])
        .filter((o) => o.site && o.text)
        .map((o) => ({ site: o.site.slice(0, 30), code: o.code ? o.code.slice(0, 30) : null, text: o.text.slice(0, 160), source: 'web' as const }));
      cache.set(key, { at: Date.now(), options, offers });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      return { options, offers };
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  return p;
}
