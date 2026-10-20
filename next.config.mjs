/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // mysql2 / better-sqlite3 都在 Node runtime 使用，避免被 edge bundle 处理
    serverComponentsExternalPackages: ["better-sqlite3", "mysql2"],
  },
};
export default nextConfig;
