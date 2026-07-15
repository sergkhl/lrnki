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
      "dist-e2e/**",
      "**/dist-e2e/**",
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
  },
  {
    // Playwright web-acceptance suite (plan 2026-07-14-001 U5): Node test files, not React
    // surfaces. `react-hooks/rules-of-hooks` false-positives on Playwright's `use()` fixture
    // callback, and the learner interaction boundary (RN primitive restrictions) does not apply
    // to a browser-driving test harness that never renders the app.
    // Also covers the opt-in real-use scaffold in e2e-realuse/ (plan 2026-07-14-001 U6).
    files: [
      "apps/learner-app/e2e/**/*.ts",
      "apps/learner-app/e2e-realuse/**/*.ts",
      "apps/learner-app/playwright.config.ts"
    ],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "no-restricted-imports": "off"
    }
  }
];

export default eslintConfig;
