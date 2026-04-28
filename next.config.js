/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Performance optimizations
  compress: true, // Enable gzip compression
  poweredByHeader: false, // Remove X-Powered-By header
  swcMinify: true, // Use SWC minifier (faster than Terser)
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  
  // Experimental features for better performance
  experimental: {
    // optimizeCss: true, // Disabled - requires 'critters' package
    optimizePackageImports: ['@tanstack/react-query', 'recharts'], // Tree-shake unused exports
    serverActions: {
      bodySizeLimit: '4mb', // Maximum 4MB (Vercel limit is 4.5MB)
    },
  },
  
  // Webpack optimizations - minimal to avoid build issues
  webpack: (config) => {
    // Ensure proper encoding
    config.resolve = {
      ...config.resolve,
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    };
    return config;
  },
  
  env: {
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1Oxdp2vH0DHkEZwxxUdQhzMgfco9yVKlkJ9llkB4oSqE',
  },
}

module.exports = nextConfig
