// Tiny JSON-file store. One shop per deployment keeps it simple; swap for Postgres
// when going multi-tenant — every read/write goes through this module.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// A new shop starts empty: the owner fills in details and menu in the app.
const seed = () => ({
  shop: { name: '', type: 'bakery', owner_phone: '', currency: 'INR', address: '', open_hours: '', policies: '', upi_id: '' },
  catalog: [],
  customers: [],
  orders: [],
  messages: [],
  sessions: {},
  connected_apps: [],
  flow_log: [],
  reports: [],
  seq: { order: 1000 },
});

// Sample shop used by the tests.
export function useDemoData() {
  const d = get();
  Object.assign(d.shop, {
    name: 'Sweet Crumbs Bakery', type: 'bakery', owner_phone: '919000000001', address: 'MG Road',
    open_hours: '11 AM – 8 PM', policies: 'Custom cakes need 24 hours notice. Delivery within 5 km for ₹50.', upi_id: 'sweetcrumbs@okaxis',
  });
  d.catalog = [
    { id: 'choc-cake-1kg', name: 'Chocolate Cake (1 kg)', aliases: ['chocolate cake', 'choco cake', 'cake'], price: 700, unit: 'piece', lead_time_hours: 12 },
    { id: 'pineapple-cake-1kg', name: 'Pineapple Cake (1 kg)', aliases: ['pineapple cake', 'pineapple'], price: 600, unit: 'piece', lead_time_hours: 12 },
    { id: 'red-velvet-1kg', name: 'Red Velvet Cake (1 kg)', aliases: ['red velvet'], price: 900, unit: 'piece', lead_time_hours: 24 },
    { id: 'cupcake-box-6', name: 'Cupcakes (box of 6)', aliases: ['cupcake', 'cupcakes'], price: 300, unit: 'box', lead_time_hours: 4 },
    { id: 'brownie', name: 'Walnut Brownie', aliases: ['brownie', 'brownies'], price: 80, unit: 'piece', lead_time_hours: 0 },
  ];
  d.seq.order = 340;
  save();
  return d;
}

// Data written by the old built-in demo (sample bakery, test orders) is cleared once,
// keeping the shop's identity and its real connections.
function dropOldDemo(d) {
  if (d.shop?.setup_done || d.shop?.name !== 'Sweet Crumbs Bakery') return d;
  const fresh = seed();
  if (d.shop.uid) fresh.shop.uid = d.shop.uid;
  if (d.integrations) fresh.integrations = d.integrations;
  return fresh;
}

// Orders and chats from the number used to test the live deployment while building it.
const BUILD_TEST_PHONES = ['919800000777'];
function removeBuildTestData(d) {
  d.migrations ||= {};
  if (d.migrations.build_test_data_removed) return d;
  const keep = (x) => !BUILD_TEST_PHONES.includes(x.phone);
  d.orders = (d.orders || []).filter(keep);
  d.messages = (d.messages || []).filter(keep);
  d.customers = (d.customers || []).filter(keep);
  for (const p of BUILD_TEST_PHONES) delete d.sessions?.[p];
  d.migrations.build_test_data_removed = true;
  return d;
}

let db = null;
let file = config.dataFile;

export function load(customFile) {
  if (customFile) file = customFile;
  if (file === ':memory:') { db = seed(); return db; }
  try {
    db = removeBuildTestData(dropOldDemo(JSON.parse(fs.readFileSync(file, 'utf8'))));
    save();
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
export const reset = () => { db = seed(); save(); return db; };

// ---------- helpers ----------
export const normPhone = (p) => String(p || '').replace(/\D/g, '');

// The dashboard's "Try it yourself" chat. Its orders never count, sync or get reminders.
export const TEST_PHONE = '910000000000';

export function clearTestData() {
  const d = get();
  d.orders = d.orders.filter((o) => o.phone !== TEST_PHONE);
  d.messages = d.messages.filter((m) => m.phone !== TEST_PHONE);
  d.customers = d.customers.filter((c) => c.phone !== TEST_PHONE);
  delete d.sessions[TEST_PHONE];
  save();
}

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
