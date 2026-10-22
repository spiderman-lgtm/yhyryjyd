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
  domain: string | null;
  title: string;
  discount_text: string;
  code: string | null;
  description: string;
  expires_at: string | null;
  exclusive: boolean;
  clicks: number;
  votes_up: number;
  votes_down: number;
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
  const [votes, setVotes] = useState({ up: c.votes_up, down: c.votes_down, mine: 0 });
  const total = votes.up + votes.down;
  const success = total ? Math.round((votes.up / total) * 100) : null;
  const failing = total >= 5 && success !== null && success < 30;

  async function vote(v: 'up' | 'down') {
    const res = await fetch(`/api/coupon/${c.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vote: v }) });
    if (res.ok) setVotes(await res.json());
  }

  return (
    <motion.div whileHover={{ y: -3 }} className={`card flex h-full flex-col overflow-hidden ${failing ? 'opacity-70' : ''}`}>
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
            {failing ? (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">Reported not working</span>
            ) : total >= 3 && success !== null ? (
              <span className="rounded bg-deal-light px-1.5 py-0.5 text-[10px] font-bold text-deal">✓ {success}% worked · {total} votes</span>
            ) : null}
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
            {(shown || votes.mine !== 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-ink-mute">{votes.mine ? 'Thanks for the feedback!' : 'Did it work?'}</span>
                <button onClick={() => vote('up')} className={`whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold ${votes.mine === 1 ? 'border-deal bg-deal text-white' : 'border-slate-200 text-deal hover:border-deal'}`}>👍 Worked{votes.up ? ` ${votes.up}` : ''}</button>
                <button onClick={() => vote('down')} className={`whitespace-nowrap rounded-full border px-2 py-0.5 font-semibold ${votes.mine === -1 ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 text-red-600 hover:border-red-400'}`}>👎 Didn’t{votes.down ? ` ${votes.down}` : ''}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showStoreLink && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2">
          <StoreLogo store={c.store} logo={c.logo_url} domain={c.domain} size="sm" />
          <Link href={`/coupons?store=${c.slug}`} className="text-xs font-semibold text-brand hover:underline">View all {c.store} coupons ›</Link>
        </div>
      )}
    </motion.div>
  );
}
