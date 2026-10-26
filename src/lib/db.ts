import fs from 'fs';
import path from 'path';

export type Platform = 'amazon' | 'flipkart' | 'myntra' | 'ajio' | 'meesho' | 'croma' | 'tatacliq' | 'reliancedigital' | 'vijaysales' | 'nykaa' | 'jiomart' | 'other';
export type Tier = 'urgent' | 'normal' | 'digest';
export type Channel = 'email' | 'whatsapp' | 'telegram';

export interface Product {
  id: string;
  url: string;
  platform: Platform;
  title: string;
  image: string | null;
  price: number;
  mrp: number | null;
  currency: string;
  in_stock: boolean;
  source: 'page' | 'ai' | 'extension';
  created_at: string;
  last_checked_at: string;
  last_error?: string;
  images?: string[];
  rating?: number | null;
  reviews?: number | null;
  last_viewed_at?: string;
  views?: number;
  // Highlights from the store's own listing (see /api/product/[id]/features).
  features?: string[];
  features_at?: string;
}

export interface PricePoint {
  product_id: string;
  price: number;
  at: string;
}

export interface Alert {
  id: string;
  uid: string;
  product_id: string;
  email: string | null;
  phone: string | null;
  channels: Channel[];
  tier: Tier;
  drop_percent: number;
  target_price: number | null;
  window_days: 7 | 15;
  baseline_price: number;
  // The shopper's Telegram chat, once they have pressed Start on the bot.
  telegram_chat?: string | null;
  last_notified_price: number | null;
  last_notified_at: string | null;
  created_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'cancelled';
}

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  google_sub: string | null;
  role: 'owner' | 'user';
  created_at: string;
}

export interface CartItem {
  id: string;
  uid: string;
  product_id: string;
  added_at: string;
}

export interface Enquiry {
  id: string;
  uid: string;
  product_id: string;
  name: string;
  email: string;
  phone: string | null;
  budget: number | null;
  message: string;
  created_at: string;
}

export interface Coupon {
  code: string | null;
  title: string;
  discount_text: string;
  conditions: string;
  source_url: string;
}

export interface StoreOffer {
  store: string;
  price: number;
  url: string;
  in_stock: boolean;
  same_variant: boolean;
  // Whether the store delivers to the shopper's pincode, where the store can tell us.
  delivery?: { pin: string; ok: boolean; by: string | null };
}

export interface RelatedItem {
  title: string;
  store: string;
  price: number;
  url: string;
  image: string | null;
  product_id?: string;
}

export interface RelatedCache {
  items: RelatedItem[];
  fetched_at: string;
}

export interface CompareCache {
  offers: StoreOffer[];
  fetched_at: string;
}

// Each store's price for a product over time, from comparisons and the extension.
export type OfferHistory = Record<string, { price: number; at: string }[]>;

export const COUPON_CATEGORIES = ['fashion', 'beauty', 'electronics', 'travel', 'food', 'grocery', 'recharge', 'ott', 'education', 'health', 'giftcard', 'other'] as const;
export type CouponCategory = (typeof COUPON_CATEGORIES)[number];

// A coupon or offer the owner adds in Admin (by hand or from a CSV), shown on the Coupons page.
export interface StoreCoupon {
  id: string;
  store: string;
  url: string;
  logo_url: string | null;
  title: string;
  discount_text: string;
  code: string | null;
  description: string;
  category: CouponCategory;
  expires_at: string | null;
  exclusive: boolean;
  featured: boolean;
  active: boolean;
  clicks: number;
  // Shoppers' "worked / didn't work" votes, one per browser or account.
  votes_up?: number;
  votes_down?: number;
  voters?: Record<string, 1 | -1>;
  created_at: string;
  updated_at: string;
}

// An offer waiting for the owner's approval: sent by a shopper, or found on a store's own offer pages.
export interface CouponSuggestion {
  id: string;
  key: string;
  source: 'shopper' | 'amazon-coupons' | 'product-offers';
  store: string;
  title: string;
  discount_text: string;
  code: string | null;
  description: string;
  url: string;
  image: string | null;
  category: CouponCategory;
  expires_at: string | null;
  submitted_by: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  coupon_id?: string;
}

// A discounted product found by searching stores for a category (Trending page).
export interface CatalogItem {
  title: string;
  store: string;
  price: number;
  mrp: number;
  off: number;
  url: string;
  image: string | null;
}

export interface CouponCache {
  key: string;
  coupons: Coupon[];
  fetched_at: string;
}

export type WhatsAppVarSource = 'product_title' | 'price' | 'old_price' | 'drop_percent' | 'coupon' | 'buy_link';

export interface Settings {
  gmail: { auth_id: string; from: string | null } | null;
  whatsapp: {
    auth_id: string;
    wba_id: string | null;
    phone_id: string | null;
    message_template_id: string | null;
    variable_map: Record<string, WhatsAppVarSource>;
    // An optional second approved template, sent the moment a shopper sets an alert.
    confirm_template_id?: string | null;
    confirm_variable_map?: Record<string, WhatsAppVarSource>;
  } | null;
  telegram?: { auth_id: string; bot: string | null; subscription: string | null; error?: string | null } | null;
  // WhatsApp through the operator's MSG91 account: their MSG91 WhatsApp number (the "bot" shoppers hear from)
  // and the two templates DealRadar created there, with what Meta said about them and their send fields.
  msg91?: {
    auth_id: string;
    number: string | null;
    templates?: { confirm: Msg91Template; drop: Msg91Template } | null;
    error?: string | null;
  } | null;
  flows: Partial<Record<Tier, string>>;
  // The on-demand flow that sends one-off emails (alert confirmations) as soon as they are queued.
  mail_flow?: string;
  // Why instant emails are not going out, when they are not (shown in Admin).
  mail_flow_error?: string | null;
  flows_activated_at: string | null;
  // Which version of the automations' steps viaSocket has; an older one is rebuilt (see ensureFlowsCurrent).
  flows_steps?: number;
  flow_status?: Record<string, string>;
  offers_checked_at?: string;
}

// A one-off email waiting to be sent through the operator's Gmail.
export interface Msg91Template {
  name: string;
  status: string; // APPROVED, PENDING, REJECTED, or what MSG91 answers
  // The send action's field for each {{n}} variable, in order, read from MSG91 once the template is approved.
  fields?: string[];
}

// A WhatsApp template message through the operator's MSG91 number; vars fill {{1}}, {{2}}, … in order.
export interface Msg91Message {
  to: string;
  template: 'confirm' | 'drop';
  vars: string[];
}

export interface WhatsAppNote {
  to: string;
  title: string;
  summary: string;
}

export interface OutboxMail {
  id: string;
  email: string | null;
  telegram?: { chat: string; text: string; url: string | null; image?: string | null; label?: string } | null;
  whatsapp?: { phone: string; template_id: string; vars: Record<string, string> } | null;
  // Sent through viaSocket's own WhatsApp (no WhatsApp Business setup): a headline and one line of text.
  whatsapp_note?: WhatsAppNote | null;
  msg91?: Msg91Message | null;
  subject: string;
  html: string;
  created_at: string;
  claimed_at: string | null;
  sent_at: string | null;
  tries: number;
}

export interface DeliveryLog {
  at: string;
  tier: Tier | 'mail';
  email: { id: string; ok: boolean; error?: string }[];
  whatsapp: { id: string; ok: boolean; error?: string }[];
  telegram?: { id: string; ok: boolean; error?: string }[];
}

interface Data {
  users: Record<string, User>;
  products: Record<string, Product>;
  history: PricePoint[];
  alerts: Record<string, Alert>;
  cart: Record<string, CartItem>;
  enquiries: Enquiry[];
  coupons: Record<string, CouponCache>;
  store_coupons: Record<string, StoreCoupon>;
  coupon_suggestions: Record<string, CouponSuggestion>;
  compare: Record<string, CompareCache>;
  offer_history: Record<string, OfferHistory>;
  related: Record<string, RelatedCache>;
  clicks: { product_id: string; uid: string; at: string }[];
  deliveries: DeliveryLog[];
  outbox: OutboxMail[];
  catalog: Record<string, { items: CatalogItem[]; fetched_at: string }>;
  // Shoppers' linked Telegram chats (by browser/account id) and the one-time codes that link them.
  telegram: { chats: Record<string, { chat: string; name: string | null; at: string }>; codes: Record<string, { uid: string; at: string }> };
  settings: Settings;
}

const DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DIR, 'dealradar.json');

function empty(): Data {
  return {
    users: {},
    products: {},
    history: [],
    alerts: {},
    cart: {},
    enquiries: [],
    coupons: {},
    store_coupons: {},
    coupon_suggestions: {},
    compare: {},
    offer_history: {},
    related: {},
    clicks: [],
    deliveries: [],
    outbox: [],
    catalog: {},
    telegram: { chats: {}, codes: {} },
    settings: { gmail: null, whatsapp: null, flows: {}, flows_activated_at: null },
  };
}

let cache: Data | null = null;

const SAME_PRICE_GAP_MS = 6 * 3600_000;
const COMPARE_KEEP_MS = 7 * 86400_000;

// Keeps the file small: a check that found the same price as the last point within 6 hours adds nothing to the
// chart, and comparisons older than a week are searched again when someone opens the product.
function compact(d: Data) {
  const last = new Map<string, PricePoint>();
  d.history = d.history.filter((h) => {
    const prev = last.get(h.product_id);
    if (prev && prev.price === h.price && Date.parse(h.at) - Date.parse(prev.at) < SAME_PRICE_GAP_MS) return false;
    last.set(h.product_id, h);
    return true;
  });
  const old = Date.now() - COMPARE_KEEP_MS;
  for (const [k, v] of Object.entries(d.compare)) if (Date.parse(v.fetched_at) < old) delete d.compare[k];
}

function load(): Data {
  if (cache) return cache;
  try {
    cache = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } as Data;
    compact(cache);
  } catch {
    cache = empty();
  }
  return cache;
}

// Changes live in memory at once; the file is rewritten at most every 2 seconds, so a burst of updates (a price
// check, a comparison, a click) costs one write instead of one per change.
let flushTimer: NodeJS.Timeout | null = null;

function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!cache) return;
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, FILE);
}

function save() {
  if (!flushTimer) flushTimer = setTimeout(flush, 2000);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    try {
      flush();
    } finally {
      process.exit(0);
    }
  });

export function read<T>(fn: (d: Data) => T): T {
  return fn(load());
}

export function write<T>(fn: (d: Data) => T): T {
  const data = load();
  const result = fn(data);
  if (data.deliveries.length > 200) data.deliveries = data.deliveries.slice(-200);
  if (data.clicks.length > 5000) data.clicks = data.clicks.slice(-5000);
  if (data.outbox.length > 300) data.outbox = data.outbox.filter((m) => !m.sent_at).slice(-300);
  save();
  return result;
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function historyFor(productId: string, days?: number): PricePoint[] {
  const since = days ? Date.now() - days * 86400_000 : 0;
  return read((d) => d.history.filter((h) => h.product_id === productId && Date.parse(h.at) >= since));
}

export function recordPrice(productId: string, price: number) {
  write((d) => {
    const now = new Date();
    for (let i = d.history.length - 1; i >= 0; i--) {
      const h = d.history[i];
      if (h.product_id !== productId) continue;
      // The same price as the last point, recently: nothing new for the chart.
      if (h.price === price && now.getTime() - Date.parse(h.at) < SAME_PRICE_GAP_MS) return;
      break;
    }
    d.history.push({ product_id: productId, price, at: now.toISOString() });
  });
}

// Call inside write(): adds a point per in-stock store when its price changed, or every 12 hours otherwise.
export function recordOffers(d: Data, productId: string, offers: StoreOffer[], at = new Date().toISOString()) {
  const h = (d.offer_history[productId] ??= {});
  for (const o of offers) {
    if (!o.in_stock || !(o.price > 0)) continue;
    const pts = (h[o.store] ??= []);
    const last = pts[pts.length - 1];
    if (last && last.price === o.price && Date.parse(at) - Date.parse(last.at) < 12 * 3600_000) continue;
    pts.push({ price: o.price, at });
    if (pts.length > 300) pts.splice(0, pts.length - 300);
  }
}
