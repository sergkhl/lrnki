// Monorepo Metro config (plan 2026-07-09-001 U2): the repo root is a watch folder and a
// module resolution root so the TS-source workspace packages (@lrnki/application/projection,
// @lrnki/learner-api/client, @lrnki/domain-core, @lrnki/ports) compile in place under
// pnpm's isolated linker. Package-exports resolution is Metro's default on this SDK.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("node:path");
const { generateLearnerTokenCss } = require("../../scripts/generate-learner-token-css.cjs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// `tokens.js` is the one semantic-token authority. Regenerate its CSS-facing
// representation before Metro reads global.css, including direct Expo CLI invocations.
generateLearnerTokenCss();

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules")
];

module.exports = withNativewind(config);
