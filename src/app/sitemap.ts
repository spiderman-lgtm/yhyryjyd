import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/config';
import { STORES } from '@/lib/stores';
import { CATEGORIES } from '@/lib/catalog';
import { read } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const u = appUrl();
  const now = new Date();
  const pages = ['', '/trending', '/deals', '/coupons', '/gift-cards', '/extension', '/rides', '/llms.txt'].map((p) => ({ url: `${u}${p}`, lastModified: now, changeFrequency: 'daily' as const, priority: p === '' ? 1 : 0.8 }));
  const stores = STORES.map((s) => ({ url: `${u}/price-tracker/${s.slug}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7 }));
  const cats = CATEGORIES.map((c) => ({ url: `${u}/trending/${c.slug}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.6 }));
  // The most viewed tracked products.
  const products = read((d) =>
    Object.values(d.products)
      .filter((p) => !p.last_error)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 500)
      .map((p) => ({ url: `${u}/p/${p.id}`, lastModified: new Date(p.last_checked_at), changeFrequency: 'daily' as const, priority: 0.5 })),
  );
  return [...pages, ...stores, ...cats, ...products];
}
