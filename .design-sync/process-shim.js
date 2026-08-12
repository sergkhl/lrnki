// Metro hands every module a `process` polyfill; esbuild does not, and several
// Expo/React Native packages read it at module scope (a bare `process` reference
// throws before window.LrnkiDS is ever assigned). Injected into the bundle rather
// than defined as a global so nothing leaks onto the host page.
export const process = {
  env: { NODE_ENV: "development", EXPO_OS: "web" },
  platform: "web",
  version: "",
  versions: {},
  argv: [],
  nextTick: (fn, ...args) => Promise.resolve().then(() => fn(...args)),
  browser: true,
};
