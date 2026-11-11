import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // The auto editor runs the ffmpeg binary from ffmpeg-static; keep it as a real file.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/editor/render": ["./node_modules/ffmpeg-static/ffmpeg", "./lib/video/fonts/**"],
  },
};

export default config;
