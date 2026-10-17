import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Coaching tab needs a server: POST /api/coach runs the rule engine and
  // (optionally) calls an AI provider. That is why the old `output: "export"`
  // is gone — the app is now served by Node instead of as plain static files.
  devIndicators: false,
};

export default nextConfig;
