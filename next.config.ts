import type { NextConfig } from "next";

const config: NextConfig = {
  // Video uploads go through the auto editor route.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default config;
