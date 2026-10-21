import fs from 'fs';
import path from 'path';

export type Platform = 'amazon' | 'flipkart' | 'myntra' | 'ajio' | 'meesho' | 'croma' | 'tatacliq' | 'reliancedigital' | 'vijaysales' | 'nykaa' | 'jiomart' | 'other';
export type Tier = 'urgent' | 'normal' | 'digest';
export type Channel = 'email' | 'whatsapp';

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
  source: 'page' | 'ai';
  created_at: string;
  last_checked_at: string;
  last_error?: string;
  images?: string[];
  rating?: number | null;
  reviews?: number | null;
  last_viewed_at?: string;
  views?: number;
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
  } | null;
  flows: Partial<Record<Tier, string>>;
  flows_activated_at: string | null;
  flow_status?: Record<string, string>;
}

export interface DeliveryLog {
  at: string;
  tier: Tier;
  email: { id: string; ok: boolean; error?: string }[];
  whatsapp: { id: string; ok: boolean; error?: string }[];
}

interface Data {
  users: Record<string, User>;
  products: Record<string, Product>;
  history: PricePoint[];
  alerts: Record<string, Alert>;
  cart: Record<string, CartItem>;
  enquiries: Enquiry[];
  coupons: Record<string, CouponCache>;
  compare: Record<string, CompareCache>;
  related: Record<string, RelatedCache>;
  clicks: { product_id: string; uid: string; at: string }[];
  deliveries: DeliveryLog[];
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
    compare: {},
    related: {},
    clicks: [],
    deliveries: [],
    settings: { gmail: null, whatsapp: null, flows: {}, flows_activated_at: null },
  };
}

let cache: Data | null = null;

function load(): Data {
  if (cache) return cache;
  try {
    cache = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } as Data;
  } catch {
    cache = empty();
  }
  return cache;
}

function save(data: Data) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

export function read<T>(fn: (d: Data) => T): T {
  return fn(load());
}

export function write<T>(fn: (d: Data) => T): T {
  const data = load();
  const result = fn(data);
  if (data.deliveries.length > 200) data.deliveries = data.deliveries.slice(-200);
  if (data.clicks.length > 5000) data.clicks = data.clicks.slice(-5000);
  save(data);
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
    d.history.push({ product_id: productId, price, at: new Date().toISOString() });
  });
}
