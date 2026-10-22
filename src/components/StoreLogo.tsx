import StoreIcon from './StoreIcon';

// A coupon store's logo: the image the owner gave, otherwise the store's own site icon.
export default function StoreLogo({ store, logo, domain = null, size = 'md' }: { store: string; logo: string | null; domain?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  if (logo) {
    const box = size === 'lg' ? 'h-20 w-40' : size === 'sm' ? 'h-8 w-20' : 'h-14 w-28';
    return (
      <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 ${box}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={store} className="max-h-full max-w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
      </span>
    );
  }
  if (size === 'sm') {
    return (
      <span className="flex min-w-0 items-center gap-2 text-xs font-bold">
        <StoreIcon store={store} domain={domain} className="h-7 w-7 rounded-md text-xs" />
        <span className="truncate">{store}</span>
      </span>
    );
  }
  return <StoreIcon store={store} domain={domain} className={size === 'lg' ? 'h-20 w-20 rounded-2xl text-3xl' : 'h-14 w-14 rounded-xl text-xl'} />;
}
