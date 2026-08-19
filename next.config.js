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
    } else {
      // ExcelJS Node entry pulls fs/stream; client exports use the browser bundle.
      config.resolve.alias = {
        ...config.resolve.alias,
        exceljs: require.resolve('exceljs/dist/exceljs.min.js'),
      };
    }

    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  tunnelRoute: '/monitoring',
});
