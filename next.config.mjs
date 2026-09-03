/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 启用 instrumentation.ts（用于启动定时同步）
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
    instrumentationHook: true,
  },
};
export default nextConfig;
