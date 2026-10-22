'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState } from 'react';
import StoreLogo from './StoreLogo';

export type CouponView = {
  id: string;
  store: string;
  slug: string;
  logo_url: string | null;
  title: string;
  discount_text: string;
  code: string | null;
  description: string;
  expires_at: string | null;
  exclusive: boolean;
  clicks: number;
};

function ends(expires: string | null) {
  if (!expires) return null;
  const days = Math.ceil((Date.parse(expires) - Date.now()) / 86400_000);
  if (days <= 1) return 'Ends today';
  if (days <= 7) return `Ends in ${days} days`;
  return `Valid till ${new Date(expires).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

export default function CouponCard({ c, showStoreLink = true }: { c: CouponView; showStoreLink?: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [more, setMore] = useState(false);

  async function reveal() {
    // The store opens in a new tab (through the tracked link) while the code stays visible here.
    window.open(`/api/coupon/${c.id}`, '_blank', 'noopener');
    setShown(true);
    if (c.code) {
      try {
        await navigator.clipboard.writeText(c.code);
        setCopied(true);
      } catch {}
    }
  }

  const badge = (c.discount_text || 'Deal').split(/\s+/);
  const ending = ends(c.expires_at);

  return (
    <motion.div whileHover={{ y: -3 }} className="card flex h-full flex-col overflow-hidden">
      <div className="flex flex-1 gap-3 p-4">
        <div className="grid w-20 shrink-0 place-items-center border-r border-dashed border-slate-200 pr-3 text-center text-sm font-black uppercase leading-tight text-brand">
          <span>
            {badge.map((w, i) => (
              <span key={i} className={/\d/.test(w) ? 'block text-2xl' : 'block text-[11px]'}>{w}</span>
            ))}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap gap-1.5">
            {c.exclusive && <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">DealRadar exclusive</span>}
            {ending && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ending.startsWith('Ends') ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-ink-mute'}`}>{ending}</span>}
            {c.clicks >= 10 && <span className="rounded bg-deal-light px-1.5 py-0.5 text-[10px] font-bold text-deal">{c.clicks} used</span>}
          </div>
          <h3 className="text-sm font-semibold leading-snug">{c.title}</h3>
          {c.description && (
            <p className={`mt-1 text-xs text-ink-mute ${more ? '' : 'line-clamp-2'}`} onClick={() => setMore(!more)}>
              {c.description}
            </p>
          )}
          <div className="mt-3">
            {shown && c.code ? (
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(c.code!);
                    setCopied(true);
                  } catch {}
                }}
                className="flex w-full items-center justify-between rounded-lg border-2 border-dashed border-brand bg-brand-light px-3 py-2 font-mono text-sm font-bold text-brand-dark"
              >
                {c.code}
                <span className="font-sans text-xs">{copied ? 'Copied ✓' : 'Copy'}</span>
              </button>
            ) : (
              <button onClick={reveal} className={c.code ? 'btn-primary w-full py-2' : 'btn-dark w-full py-2'}>
                {c.code ? 'Show code' : shown ? 'Opened ✓ — get deal again' : 'Get deal'}
              </button>
            )}
            {shown && c.code && <p className="mt-1 text-[11px] text-ink-mute">{c.store} opened in a new tab — paste the code at checkout.</p>}
          </div>
        </div>
      </div>
      {showStoreLink && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2">
          <StoreLogo store={c.store} logo={c.logo_url} size="sm" />
          <Link href={`/coupons?store=${c.slug}`} className="text-xs font-semibold text-brand hover:underline">View all {c.store} coupons ›</Link>
        </div>
      )}
    </motion.div>
  );
}
