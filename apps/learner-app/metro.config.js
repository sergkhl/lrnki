// Monorepo Metro config (plan 2026-07-09-001 U2): the repo root is a watch folder and a
// module resolution root so the TS-source workspace packages (@lrnki/application/projection,
// @lrnki/learner-api/client, @lrnki/domain-core, @lrnki/ports) compile in place under
// pnpm's isolated linker. Package-exports resolution is Metro's default on this SDK.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules")
];

module.exports = withNativeWind(config, { input: "./src/global.css" });
