/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['cheerio'],
    // Every page here shows live data (cart, alerts, prices), so the browser must not reuse an old copy.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
