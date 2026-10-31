import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Allow accessing the dev server from other devices on the local network
  // (e.g. testing the widget on a phone/tablet at http://192.168.x.x:3000).
  // Dev-only; ignored in production builds.
  allowedDevOrigins: ["192.168.0.118"],
};

export default nextConfig;
