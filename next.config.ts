import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm test` builds into .next-test so it never touches the .next a running dev server uses.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
