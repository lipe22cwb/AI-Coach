import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the phone to load Next.js development assets over the local network.
  // Update this hostname if the computer's LAN address changes.
  allowedDevOrigins: ["10.0.0.109"],
  // API routes for AI Coaching and Ranked require a server.
  devIndicators: false,
};

export default nextConfig;
