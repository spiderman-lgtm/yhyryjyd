// Tiny JSON-file store. One shop per deployment keeps it simple; swap for Postgres
// when going multi-tenant — every read/write goes through this module.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const seed = () => ({
  shop: {
    name: 'Sweet Crumbs Bakery',
    type: 'bakery',
    owner_phone: '919000000001',
    currency: 'INR',
    address: 'MG Road',
    open_hours: '11 AM – 8 PM',
    policies: 'Custom cake ke liye 24 ghante pehle order. Delivery 5 km tak ₹50.',
  },
  catalog: [
    { id: 'choc-cake-1kg', name: 'Chocolate Cake (1 kg)', aliases: ['chocolate cake', 'choco cake', 'cake'], price: 700, unit: 'piece', lead_time_hours: 12 },
    { id: 'pineapple-cake-1kg', name: 'Pineapple Cake (1 kg)', aliases: ['pineapple cake', 'pineapple'], price: 600, unit: 'piece', lead_time_hours: 12 },
    { id: 'red-velvet-1kg', name: 'Red Velvet Cake (1 kg)', aliases: ['red velvet'], price: 900, unit: 'piece', lead_time_hours: 24 },
    { id: 'cupcake-box-6', name: 'Cupcakes (box of 6)', aliases: ['cupcake', 'cupcakes'], price: 300, unit: 'box', lead_time_hours: 4 },
    { id: 'brownie', name: 'Walnut Brownie', aliases: ['brownie', 'brownies'], price: 80, unit: 'piece', lead_time_hours: 0 },
  ],
  customers: [],
  orders: [],
  messages: [],
  sessions: {},
  connected_apps: [
    { name: 'WhatsApp Business', verdict: 'GO', score: 100, added_at: new Date().toISOString() },
    { name: 'Google Sheets', verdict: 'GO', score: 90, added_at: new Date().toISOString() },
    { name: 'Razorpay', verdict: 'GO', score: 89, added_at: new Date().toISOString() },
  ],
  flow_log: [],
  reports: [],
  seq: { order: 340 },
});

let db = null;
let file = config.dataFile;

export function load(customFile) {
  if (customFile) file = customFile;
  if (file === ':memory:') { db = seed(); return db; }
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = seed();
    save();
  }
  return db;
}

let timer = null;
export function save() {
  if (file === ':memory:' || !db) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 50);
}
export function flush() {
  if (file === ':memory:' || !db) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

export const get = () => db || load();
// Demo reset keeps the shop's identity and its real app connections.
export const reset = () => {
  const keep = { uid: db?.shop?.uid, integrations: db?.integrations };
  db = seed();
  if (keep.uid) db.shop.uid = keep.uid;
  if (keep.integrations) db.integrations = keep.integrations;
  save();
  return db;
};

// ---------- helpers ----------
export const normPhone = (p) => String(p || '').replace(/\D/g, '');

export function upsertCustomer(phone, name) {
  const d = get();
  phone = normPhone(phone);
  let c = d.customers.find((x) => x.phone === phone);
  if (!c) {
    c = { phone, name: name || '', created_at: new Date().toISOString(), paused_reminders: false };
    d.customers.push(c);
  } else if (name && !c.name) c.name = name;
  save();
  return c;
}

export function logMessage(phone, direction, text, meta = {}) {
  const d = get();
  const m = { id: `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`, phone: normPhone(phone), direction, text, at: new Date().toISOString(), ...meta };
  d.messages.push(m);
  if (d.messages.length > 5000) d.messages.splice(0, d.messages.length - 5000);
  save();
  return m;
}

export function nextOrderId() {
  const d = get();
  d.seq.order += 1;
  save();
  return String(d.seq.order);
}

export const findOrder = (id) => get().orders.find((o) => o.id === String(id).replace(/^#/, ''));
