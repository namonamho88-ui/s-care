import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  devIndicators: false,
  experimental: {
    cpus: process.env.SCARE_LOW_MEMORY_BUILD === '1' ? 1 : 2,
    ...(process.env.SCARE_LOW_MEMORY_BUILD === '1' ? { webpackMemoryOptimizations: true } : {}),
  },
};
export default config;
