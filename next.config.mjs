/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @solana/web3.js pulls in optional node deps some bundlers try to resolve.
  webpack: (config) => {
    config.externals = config.externals || [];
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
