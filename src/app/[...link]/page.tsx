import { notFound } from 'next/navigation';
import OpenLink from '@/components/OpenLink';

export const dynamic = 'force-dynamic';

// dealradar.embarko.app/https://www.amazon.in/dp/… opens that product's page.
// Proxies may collapse "https://" to "https:/", so both forms are accepted.
export default function LinkPrefix({ params, searchParams }: { params: { link: string[] }; searchParams: Record<string, string | string[]> }) {
  const parts = params.link.map((p) => decodeURIComponent(p));
  let raw = parts.join('/');
  if (/^https?:$/i.test(parts[0])) raw = `${parts[0]}//${parts.slice(1).filter(Boolean).join('/')}`;
  else if (/^(www\.|m\.|dl\.)?(amazon|amzn|flipkart|fkrt|myntra|myntr|ajio|meesho|croma|tatacliq|reliancedigital|vijaysales|nykaa|jiomart)\.[a-z.]+$/i.test(parts[0])) raw = `https://${raw}`;
  else notFound();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, x);
  const url = `${raw}${qs.toString() ? `?${qs}` : ''}`;
  try {
    new URL(url);
  } catch {
    notFound();
  }
  return <OpenLink url={url} />;
}
