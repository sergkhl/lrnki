import path from "node:path";
import type { NextConfig } from "next";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../..", ".env"));
} catch {
  // The repository-root .env is optional; preserve the ambient environment.
}

const nextConfig: NextConfig = { typedRoutes: true, transpilePackages: ["@lrnki/domain-core"] };
export default nextConfig;
