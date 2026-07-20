import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this project so a stray parent-dir lockfile
  // can't make the Vercel build trace the wrong workspace.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // @solana/web3.js pulls in optional node deps some bundlers try to resolve.
  webpack: (config) => {
    config.externals = config.externals || [];
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
