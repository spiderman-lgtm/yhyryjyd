'use client';

import { useMemo, useState } from 'react';
import type { CouponCategory, StoreCoupon } from '@/lib/db';

const CATEGORIES: [CouponCategory, string][] = [
  ['fashion', 'Fashion'],
  ['beauty', 'Beauty'],
  ['electronics', 'Electronics'],
  ['travel', 'Travel'],
  ['food', 'Food'],
  ['grocery', 'Grocery'],
  ['recharge', 'Recharge'],
  ['ott', 'OTT'],
  ['education', 'Education'],
  ['health', 'Health'],
  ['giftcard', 'Gift card'],
  ['other', 'Other'],
];

const TEMPLATE =
  'store,title,discount,code,category,expires,link,description,logo,exclusive,featured\n' +
  'AJIO,"All Stars Sale: 50-90% off + extra ₹400 off",Up to 90% off,AJIO400,fashion,2026-11-30,https://www.ajio.com/,"On orders above ₹2,500",,no,yes\n' +
  'Udemy,Best-selling courses from ₹449,Up to 85% off,,education,,https://www.udemy.com/,,,no,no\n' +
  'Flipkart,Flipkart Gift Card,3.6% off,,giftcard,,https://www.gyftr.com/flipkart,"Instant e-gift card, use at Flipkart checkout",,no,no\n';

type Form = {
  id?: string;
  store: string;
  url: string;
  logo_url: string;
  title: string;
  discount_text: string;
  code: string;
  description: string;
  category: CouponCategory;
  expires_at: string;
  exclusive: boolean;
  featured: boolean;
};

const EMPTY: Form = { store: '', url: '', logo_url: '', title: '', discount_text: '', code: '', description: '', category: 'fashion', expires_at: '', exclusive: false, featured: false };

const status = (c: StoreCoupon) => (!c.active ? 'Paused' : c.expires_at && Date.parse(c.expires_at) <= Date.now() ? 'Expired' : 'Live');

export default function CouponManager({ initial }: { initial: StoreCoupon[] }) {
  const [coupons, setCoupons] = useState(initial);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csv, setCsv] = useState('');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string; errors?: { line: number; error: string }[] } | null>(null);
  const [filter, setFilter] = useState('');

  const storeNames = useMemo(() => [...new Set(coupons.map((c) => c.store))].sort(), [coupons]);
  const list = useMemo(
    () =>
      coupons
        .filter((c) => !filter || `${c.store} ${c.title} ${c.code ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
    [coupons, filter],
  );
  const counts = { live: coupons.filter((c) => status(c) === 'Live').length, expired: coupons.filter((c) => status(c) === 'Expired').length, paused: coupons.filter((c) => !c.active).length };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function reload() {
    // The server page is the source of truth after a bulk import.
    window.location.reload();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error || 'Could not save the coupon.' });
    setCoupons((cs) => [data.coupon, ...cs.filter((c) => c.id !== data.coupon.id)]);
    setMsg({ ok: true, text: form.id ? 'Coupon updated.' : 'Coupon added — it is live on the Coupons page.' });
    setForm({ ...EMPTY, store: form.store, category: form.category, url: form.id ? '' : form.url, logo_url: form.id ? '' : form.logo_url });
  }

  function edit(c: StoreCoupon) {
    setForm({
      id: c.id,
      store: c.store,
      url: c.url,
      logo_url: c.logo_url ?? '',
      title: c.title,
      discount_text: c.discount_text,
      code: c.code ?? '',
      description: c.description,
      category: c.category,
      expires_at: c.expires_at ? new Date(Date.parse(c.expires_at) + 5.5 * 3600_000).toISOString().slice(0, 10) : '',
      exclusive: c.exclusive,
      featured: c.featured,
    });
    setMsg(null);
    document.getElementById('coupons')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function toggle(c: StoreCoupon) {
    const res = await fetch('/api/admin/coupons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, active: !c.active }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setCoupons((cs) => cs.map((x) => (x.id === c.id ? data.coupon : x)));
  }

  async function remove(c: StoreCoupon) {
    if (!confirm(`Delete “${c.title}” from ${c.store}?`)) return;
    const res = await fetch(`/api/admin/coupons?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
    if (res.ok) setCoupons((cs) => cs.filter((x) => x.id !== c.id));
  }

  async function importCsv() {
    setBusy(true);
    setImportMsg(null);
    const res = await fetch('/api/admin/coupons/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setImportMsg({ ok: false, text: data.error || 'Import failed.' });
    setImportMsg({ ok: data.errors.length === 0, text: `Added or updated ${data.added} coupon${data.added === 1 ? '' : 's'}${data.errors.length ? `; ${data.errors.length} row(s) skipped` : ''}.`, errors: data.errors });
    if (data.added) setTimeout(reload, data.errors.length ? 4000 : 800);
  }

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand';

  return (
    <section id="coupons" className="card scroll-mt-20 space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">4 · Coupons & offers</h2>
          <p className="text-sm text-ink-soft">
            Coupons you add here show on the <a href="/coupons" target="_blank" className="font-semibold text-brand underline">Coupons page</a>, at “Buy now” for that store, and in price-drop alerts.
            Clicks go through your affiliate link.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-lg bg-deal-light px-2.5 py-1 font-semibold text-deal">{counts.live} live</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-ink-soft">{counts.expired} expired</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-ink-soft">{counts.paused} paused</span>
        </div>
      </div>

      <form onSubmit={save} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3 font-semibold">{form.id ? 'Edit coupon' : 'Add a coupon'}</div>
        <label className="text-sm">
          <span className="label">Store *</span>
          <input required list="coupon-stores" value={form.store} onChange={(e) => set('store', e.target.value)} placeholder="AJIO" className={input} />
          <datalist id="coupon-stores">{[...new Set(['Amazon', 'Flipkart', 'Myntra', 'AJIO', 'Nykaa', 'Croma', 'Tata CLiQ', ...storeNames])].map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="text-sm sm:col-span-1 lg:col-span-2">
          <span className="label">Offer link * (where the shopper lands)</span>
          <input required type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://www.ajio.com/sale" className={input} />
        </label>
        <label className="text-sm lg:col-span-2">
          <span className="label">Title *</span>
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="All Stars Sale: 50-90% off + extra ₹400 off" className={input} />
        </label>
        <label className="text-sm">
          <span className="label">Badge</span>
          <input value={form.discount_text} onChange={(e) => set('discount_text', e.target.value)} placeholder="Up to 90% off" maxLength={40} className={input} />
        </label>
        <label className="text-sm">
          <span className="label">Coupon code (empty = deal, no code)</span>
          <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="AJIO400" className={`${input} font-mono`} />
        </label>
        <label className="text-sm">
          <span className="label">Category</span>
          <select value={form.category} onChange={(e) => set('category', e.target.value as CouponCategory)} className={input}>
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Expires on (empty = no expiry)</span>
          <input type="date" value={form.expires_at} onChange={(e) => set('expires_at', e.target.value)} className={input} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="label">Terms / description</span>
          <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Min. order ₹2,500. Not valid on gold." className={input} />
        </label>
        <label className="text-sm">
          <span className="label">Logo image URL (optional)</span>
          <input type="url" value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://…/logo.png" className={input} />
        </label>
        <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} /> Featured (shows first)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.exclusive} onChange={(e) => set('exclusive', e.target.checked)} /> DealRadar exclusive</label>
          <span className="flex-1" />
          {form.id && <button type="button" onClick={() => setForm(EMPTY)} className="btn-ghost px-4 py-2">Cancel edit</button>}
          <button disabled={busy} className="btn-primary px-5 py-2">{busy ? 'Saving…' : form.id ? 'Save changes' : 'Add coupon'}</button>
        </div>
        {msg && <p className={`text-sm sm:col-span-2 lg:col-span-3 ${msg.ok ? 'text-deal' : 'text-red-600'}`}>{msg.text}</p>}
      </form>

      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-semibold">Bulk import from CSV (from a spreadsheet or an affiliate network export)</summary>
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-ink-soft">
            Columns: <code>store, title, discount, code, category, expires, link, description, logo, exclusive, featured</code>. Only store, title and link are required. Category is one of{' '}
            {CATEGORIES.map(([k]) => k).join(', ')}. The same store + code updates the existing coupon instead of adding a copy.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="dealradar-coupons-template.csv" className="btn-ghost px-3 py-1.5">Download template</a>
            <label className="btn-ghost cursor-pointer px-3 py-1.5">
              Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
            </label>
          </div>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder={TEMPLATE} className={`${input} font-mono text-xs`} />
          <button type="button" disabled={busy || !csv.trim()} onClick={importCsv} className="btn-dark px-4 py-2">{busy ? 'Importing…' : 'Import coupons'}</button>
          {importMsg && (
            <div className={importMsg.ok ? 'text-deal' : 'text-red-600'}>
              {importMsg.text}
              {importMsg.errors?.slice(0, 10).map((e) => <div key={e.line} className="text-xs">Line {e.line}: {e.error}</div>)}
            </div>
          )}
        </div>
      </details>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-semibold">Your coupons ({coupons.length})</h3>
          {coupons.length > 5 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />}
        </div>
        {list.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-ink-soft">No coupons yet. Add one above or import a CSV.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase text-ink-mute">
                <tr>
                  <th className="py-2">Store</th>
                  <th>Offer</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th className="text-right">Clicks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const st = status(c);
                  return (
                    <tr key={c.id} className="border-t border-slate-100 align-top">
                      <td className="py-2 font-semibold">{c.store}{c.featured && <span className="ml-1 text-amber-500" title="Featured">★</span>}</td>
                      <td className="max-w-xs">
                        <div className="line-clamp-1">{c.title}</div>
                        <div className="text-xs text-ink-mute">{c.discount_text} · {c.category}{c.expires_at && ` · till ${new Date(c.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}</div>
                      </td>
                      <td className="font-mono text-xs">{c.code ?? '—'}</td>
                      <td><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${st === 'Live' ? 'bg-deal-light text-deal' : st === 'Expired' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-ink-mute'}`}>{st}</span></td>
                      <td className="text-right">{c.clicks}</td>
                      <td className="whitespace-nowrap text-right text-xs">
                        <button onClick={() => edit(c)} className="px-1.5 font-semibold text-brand hover:underline">Edit</button>
                        <button onClick={() => toggle(c)} className="px-1.5 text-ink-soft hover:underline">{c.active ? 'Pause' : 'Resume'}</button>
                        <button onClick={() => remove(c)} className="px-1.5 text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
