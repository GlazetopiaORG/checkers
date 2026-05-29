/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace engine is TS source — Next transpiles it for us.
  transpilePackages: ['@glazetopia/engine'],

  /**
   * Embed-friendly response headers.
   *
   * Discord renders embedded games inside an iframe. By default Next.js
   * doesn't ship X-Frame-Options, but we set frame-ancestors via CSP for
   * explicit allowance. In Phase 6 this can be tightened to specifically
   * discord.com if we want stronger anti-clickjacking.
   *
   * We only apply this to the gameplay route — the API stays unconstrained.
   */
  async headers() {
    return [
      {
        source: '/checkers/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *;",
          },
          // Explicitly NOT setting X-Frame-Options — that legacy header
          // would block all embedding. CSP frame-ancestors is the modern
          // mechanism and takes precedence.
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
