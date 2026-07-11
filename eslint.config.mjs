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
    // Expo/Metro/Tailwind/Jest config files are CommonJS by toolchain contract.
    files: ["apps/learner-app/*.config.js", "apps/learner-app/jest.setup.js", "apps/learner-app/src/ui/tokens.js"],
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
  },
  {
    // Learner interaction boundary (plan 2026-07-10-003 R3): learner surfaces render
    // interactive and text primitives only through the app-owned UI module. Composed
    // with (not replacing) the repository path restrictions above, because a later
    // `no-restricted-imports` entry overrides earlier ones for matching files.
    files: ["apps/learner-app/src/**/*.{ts,tsx}"],
    ignores: ["apps/learner-app/src/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: [
                "Pressable",
                "TouchableOpacity",
                "TouchableHighlight",
                "TouchableWithoutFeedback",
                "TouchableNativeFeedback",
                "Button",
                "Modal",
                "Text",
                "TextInput"
              ],
              message: "Import the app-owned equivalent from @/ui instead (learner interaction boundary)."
            }
          ],
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
