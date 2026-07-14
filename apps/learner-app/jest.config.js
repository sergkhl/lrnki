// KTD8: the one learner-app test runner. jest-expo provides the RN transform chain;
// the ignore-pattern extension lets the untranspiled UI deps (rn-primitives, lucide)
// pass through Babel like the Expo packages do.
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.js"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["<rootDir>/src/**/*.test.(ts|tsx)"],
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@rn-primitives|lucide-react-native|nativewind|react-native-css))"
  ]
};
