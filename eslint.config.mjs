import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const repositoryImportPatterns = [
  "@lrnki/*/src/*",
  "../../packages/*",
  "../../../packages/*",
  "../../apps/*",
  "../../../apps/*"
];

export default tseslint.config(
  {
    ignores: [
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
      "tmp/**",
      "**/tmp/**",
      "**/.tsbuildinfo",
      "pnpm-lock.yaml"
    ]
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{tsx,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off"
    }
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: repositoryImportPatterns }
      ]
    }
  },
  {
    files: [
      "apps/learner-app/*.config.js",
      "apps/learner-app/jest.setup.js",
      "apps/learner-app/src/ui/tokens.js"
    ],
    rules: { "@typescript-eslint/no-require-imports": "off" }
  },
  {
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
              name: "react-native-safe-area-context",
              importNames: ["useSafeAreaInsets", "useSafeArea", "SafeAreaView", "SafeAreaInsetsContext"],
              message: "Safe-area insets are owned by the @/ui surfaces."
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
              message: "Import the app-owned equivalent from @/ui."
            }
          ],
          patterns: repositoryImportPatterns
        }
      ]
    }
  },
  {
    files: [
      "apps/learner-app/e2e/**/*.ts",
      "apps/learner-app/e2e-realuse/**/*.ts",
      "apps/learner-app/e2e-native/**/*.ts",
      "apps/learner-app/playwright.config.ts"
    ],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "no-restricted-imports": "off"
    }
  }
);
