const path = require('path');
const fs = require('fs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@flowtiq/shared-types'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
  webpack(config, { buildId }) {
    // P21: Write build ID to public/sw-version.js on each build so the SW cache busts automatically.
    const swVersionFile = path.join(__dirname, 'public', 'sw-version.js');
    fs.writeFileSync(swVersionFile, `self.SW_BUILD_ID = ${JSON.stringify(buildId)};\n`);
    return config;
  },
};

module.exports = nextConfig;
