import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Search engines and AI crawlers are welcome on the public pages; shoppers' own pages and the API are not indexed.
export default function robots(): MetadataRoute.Robots {
  const disallow = ['/api/', '/admin', '/alerts', '/cart', '/dashboard', '/manage', '/login', '/signup', '/forgot', '/reset'];
  return {
    rules: [
      { userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'Googlebot'], allow: ['/', '/llms.txt'], disallow },
      { userAgent: '*', allow: '/', disallow },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
    host: appUrl(),
  };
}
