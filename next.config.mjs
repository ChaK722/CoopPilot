/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16 dev servers block cross-origin dev resources by default. The E2E
  // dev server is reached at http://127.0.0.1:<port>, so allow that host for
  // development only; production builds ignore this option.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
