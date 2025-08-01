/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fast Refreshの最適化
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }
    return config
  },
}

export default nextConfig
