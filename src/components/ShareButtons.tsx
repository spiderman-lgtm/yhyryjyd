'use client';

import { useState } from 'react';

export default function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => window.location.href.split('?')[0];
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-4 pr-1 text-sm text-ink-soft">
      Share on
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.open(`https://wa.me/?text=${encodeURIComponent(`${title} — check the price on DealRadar: ${url()}`)}`, '_blank', 'noopener');
        }}
        className="ml-1 grid h-8 w-8 place-items-center rounded-full bg-[#25d366] text-white"
        aria-label="Share on WhatsApp"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2s-1 .3-3.4-.7a11.6 11.6 0 0 1-4.6-4c-.8-1.1-1-2.2-.3-3.1.3-.4.7-.6 1-.6h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6c-.2.2-.3.4-.1.7a8.4 8.4 0 0 0 4.1 3.4c.3.1.5.1.7-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.2.5.2.5.4s0 .6-.2 1.3z" /></svg>
      </a>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url());
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
        className="grid h-8 min-w-8 place-items-center rounded-full px-2 hover:bg-slate-100"
        aria-label="Copy link"
      >
        {copied ? 'Copied' : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
      </button>
    </div>
  );
}
