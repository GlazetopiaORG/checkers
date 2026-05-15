/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace engine package.
  transpilePackages: ['@glazetopia/engine'],
  experimental: {
    // Server actions and other experimental flags can be added here as needed.
  },
};

export default nextConfig;
