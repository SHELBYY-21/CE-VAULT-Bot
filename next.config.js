/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller image for Docker / VPS / App Hosting
  // Render uses `next start`, which requires the standard build output.
  // Preserve standalone output for Docker / other standalone deployments.
  ...(process.env.RENDER === 'true' ? {} : { output: 'standalone' }),
};

module.exports = nextConfig;
