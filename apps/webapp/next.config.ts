import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot
  },
  transpilePackages: [
    "@scout/api-contracts",
    "@scout/config",
    "@scout/domain",
    "@scout/privacy",
    "@scout/ui",
    "@scout/validation"
  ]
};

export default nextConfig;
