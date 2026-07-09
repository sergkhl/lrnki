import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "**/.next/**",
      "node_modules/**",
      "**/node_modules/**",
      "dist/**",
      "**/dist/**",
      "coverage/**",
      "**/coverage/**",
      ".data/**",
      ".cache/**",
      ".local/**",
      "tmp/**",
      "**/.tsbuildinfo",
      "pnpm-lock.yaml"
    ]
  },
  ...nextVitals,
  ...nextTypescript,
  {
    // Expo/Metro/Tailwind config files are CommonJS by toolchain contract.
    files: ["apps/learner-app/*.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" }
  },
  {
    settings: { next: { rootDir: "apps/admin-lab" } },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@lrnki/*/src/*",
            "../../packages/*",
            "../../../packages/*",
            "../../apps/*",
            "../../../apps/*"
          ]
        }
      ]
    }
  }
];

export default eslintConfig;
