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
      "dist-realuse/**",
      "**/dist-realuse/**",
      "coverage/**",
      "**/coverage/**",
      ".data/**",
      ".cache/**",
      ".local/**",
      // `.gitignore`'s `tmp/` matches any depth, so generated artifacts legitimately land in
      // `apps/*/tmp/` too (rule 10) — the Playwright HTML report among them. Both forms are
      // needed here, exactly as for `dist` above.
      "tmp/**",
      "**/tmp/**",
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
              name: "@expo/ui/community/bottom-sheet",
              message: "Import BottomSheet from @/ui so dismissal, safe-area, and layer behavior stay app-owned."
            },
            {
              // Safe-area framing is a property of the surface that owns a device edge, not of
              // its callers: delegating it is how the Crystal Formation header ended up under
              // the status bar while its two sibling full-screen surfaces hand-rolled the inset.
              // `SafeAreaProvider` stays importable — the root layout must still mount it.
              name: "react-native-safe-area-context",
              importNames: ["useSafeAreaInsets", "useSafeArea", "SafeAreaView", "SafeAreaInsetsContext"],
              message: "Safe-area insets are owned by the @/ui surfaces (Screen, FullScreenDialog, SideSheet, BottomSheet). Do not hand-roll them on a consumer."
            },
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
