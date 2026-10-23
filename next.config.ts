import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes need a Node.js server instead of a static export.
  devIndicators: false,
};

export default nextConfig;
