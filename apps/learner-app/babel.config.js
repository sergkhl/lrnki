module.exports = function (api) {
  // NativeWind v5 rewrites component imports in Metro; babel-preset-expo owns the
  // Worklets transform exactly once for Reanimated 4.
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
