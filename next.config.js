/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller image for Docker / VPS / App Hosting
  // Render and Netlify use their own Next.js runtimes, which require the standard build output.
  // Preserve standalone output for Docker / other standalone deployments.
  ...(process.env.RENDER === 'true' || process.env.NETLIFY === 'true' ? {} : { output: 'standalone' }),
};

module.exports = nextConfig;
