/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  swcMinify: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  experimental: {
    optimizePackageImports: ['@tanstack/react-query', 'recharts'],
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },

  webpack: (config, { isServer }) => {
    config.resolve = {
      ...config.resolve,
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    };

    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('@resvg/resvg-js');
    }

    return config;
  },

  env: {
    GOOGLE_SHEETS_SPREADSHEET_ID:
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1Oxdp2vH0DHkEZwxxUdQhzMgfco9yVKlkJ9llkB4oSqE',
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
});
