/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller image for Docker / VPS / App Hosting
  output: 'standalone',
};

module.exports = nextConfig;
