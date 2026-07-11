module.exports = function (api) {
  // Jest runs with BABEL_ENV=test. NativeWind's interop transform stays off there:
  // className props remain inert strings for component assertions, and jest.mock
  // factories keep plain `require("react-native")` calls.
  const isTest = api.env("test");
  api.cache.using(() => isTest);
  if (isTest) {
    return { presets: ["babel-preset-expo"] };
  }
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel"
    ]
  };
};
