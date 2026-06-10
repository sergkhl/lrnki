import type { NextConfig } from "next";
const nextConfig: NextConfig = { typedRoutes: true, transpilePackages: ["@lrnki/domain-core"] };
export default nextConfig;
