import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a pnpm-lock.yaml in a parent
  // directory otherwise makes Next infer the wrong root).
  turbopack: {
    root: __dirname,
  },
  // public/ assets aren't fingerprinted, so Next defaults them to
  // max-age=0. The GLB never changes in place (rename on swap, e.g.
  // perfume-v2.glb), so let browsers cache it for a year.
  async headers() {
    return [
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
