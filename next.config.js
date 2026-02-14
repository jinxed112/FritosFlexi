/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'krjqrdqawkjjvvtoydxb.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

module.exports = nextConfig;
