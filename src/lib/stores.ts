import type { Platform } from './db';

export const STORES: { slug: Platform; name: string; color: string; example: string }[] = [
  { slug: 'amazon', name: 'Amazon', color: '#ff9900', example: 'https://www.amazon.in/dp/B0XXXXXXXX' },
  { slug: 'flipkart', name: 'Flipkart', color: '#2874f0', example: 'https://www.flipkart.com/…/p/itm…?pid=…' },
  { slug: 'myntra', name: 'Myntra', color: '#ff3f6c', example: 'https://www.myntra.com/…/12345678/buy' },
  { slug: 'ajio', name: 'AJIO', color: '#2c4152', example: 'https://www.ajio.com/…/p/…' },
  { slug: 'meesho', name: 'Meesho', color: '#9f2089', example: 'https://www.meesho.com/…/p/…' },
  { slug: 'croma', name: 'Croma', color: '#12daa8', example: 'https://www.croma.com/…/p/…' },
  { slug: 'tatacliq', name: 'Tata CLiQ', color: '#da1c5c', example: 'https://www.tatacliq.com/…/p-mp…' },
  { slug: 'reliancedigital', name: 'Reliance Digital', color: '#e42529', example: 'https://www.reliancedigital.in/…/p/…' },
  { slug: 'vijaysales', name: 'Vijay Sales', color: '#ed1c24', example: 'https://www.vijaysales.com/…' },
  { slug: 'nykaa', name: 'Nykaa', color: '#fc2779', example: 'https://www.nykaa.com/…/p/…' },
  { slug: 'jiomart', name: 'JioMart', color: '#0078ad', example: 'https://www.jiomart.com/p/…' },
];

export const storeBySlug = (s: string) => STORES.find((x) => x.slug === s) ?? null;
