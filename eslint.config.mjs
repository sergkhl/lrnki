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
