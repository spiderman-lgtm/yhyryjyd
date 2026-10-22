import { storeColor } from '@/lib/stores';

// The store's logo when the owner gave one, otherwise its name on the store's colour.
export default function StoreLogo({ store, logo, size = 'md' }: { store: string; logo: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-40 text-xl' : size === 'sm' ? 'h-8 w-20 text-[11px]' : 'h-14 w-28 text-sm';
  if (logo) {
    return (
      <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 ${box}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={store} className="max-h-full max-w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      </span>
    );
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg px-2 text-center font-black leading-tight text-white ${box}`} style={{ background: storeColor(store) }}>
      {store}
    </span>
  );
}
