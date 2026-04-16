import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-platform/ui", "@agent-platform/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
    ],
  },
};

export default nextConfig;
