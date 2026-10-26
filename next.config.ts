import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes for AI Coaching and Ranked require a server.
  devIndicators: false,
};

export default nextConfig;
