/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@marketing-platform/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/v1/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
