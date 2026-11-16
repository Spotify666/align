import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

// Which build this is: open pages compare it with the live one and reload after a deploy.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  // The plan's map of the site (docs/13, section 3) names these addresses; each lands on the page that does that job.
  async redirects() {
    return [
      { source: "/how-it-works", destination: "/guide", permanent: false },
      { source: "/settings", destination: "/profile", permanent: false },
      { source: "/levels", destination: "/#levels", permanent: false },
      { source: "/players", destination: "/#coaches", permanent: false },
      { source: "/coaches", destination: "/#coaches", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
