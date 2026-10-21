/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  experimental: { serverComponentsExternalPackages: ['cheerio'] },
};

export default nextConfig;
