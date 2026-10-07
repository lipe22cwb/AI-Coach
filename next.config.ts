import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The current prototype can be hosted as plain files from the out folder.
  // Remove this setting when the app needs server routes or server-side auth.
  output: "export",
  devIndicators: false,
};

export default nextConfig;
