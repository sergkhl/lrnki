/* eslint-env jest */
// A self-contained Reanimated stand-in: the official mock still initializes the
// react-native-worklets native module, which cannot load under Jest. Animations
// resolve immediately; useReducedMotion is a jest.fn tests flip per-case.
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View, Text, ScrollView, Image, Pressable } = require("react-native");
  const immediate = (toValue, _config, callback) => {
    callback?.(true);
    return toValue;
  };
  const sharedValue = (init) => {
    const box = { value: init };
    box.get = () => box.value;
    box.set = (next) => {
      box.value = typeof next === "function" ? next(box.value) : next;
    };
    return box;
  };
  return {
    __esModule: true,
    default: {
      View,
      Text,
      ScrollView,
      Image,
      createAnimatedComponent: (Component) => Component
    },
    createAnimatedComponent: (Component) => Component,
    useSharedValue: (init) => React.useRef(sharedValue(init)).current,
    useAnimatedStyle: (factory) => factory(),
    useDerivedValue: (factory) => ({ value: factory(), get: factory }),
    useAnimatedProps: (factory) => factory(),
    useReducedMotion: jest.fn(() => false),
    withTiming: immediate,
    withSpring: immediate,
    withDelay: (_ms, animation) => animation,
    withSequence: (...animations) => animations.at(-1),
    withRepeat: (animation) => animation,
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
    Easing: new Proxy({}, { get: () => (x) => (typeof x === "number" ? x : (y) => y) }),
    __pressable: Pressable
  };
});

// Haptics are asserted by call, never executed, in tests.
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" }
}));

// The Expo UI bottom sheet is a native/vaul component; tests exercise the app wrapper's
// controlled contract against this minimal gorhom-compatible fake.
jest.mock("@expo/ui/community/bottom-sheet", () => {
  const React = require("react");
  const { View } = require("react-native");
  const BottomSheet = ({ children, onClose, ref, ...rest }) => {
    React.useImperativeHandle(ref, () => ({
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
      close: () => onClose?.(),
      forceClose: () => onClose?.(),
      present: jest.fn(),
      dismiss: () => onClose?.()
    }));
    return React.createElement(View, { testID: "bottom-sheet", accessibilityViewIsModal: true, ...propsForFake(rest) }, children);
  };
  const propsForFake = ({ enablePanDownToClose }) => ({ accessibilityHint: enablePanDownToClose ? "pan-enabled" : "pan-disabled" });
  const BottomSheetView = ({ children }) => React.createElement(View, null, children);
  return { __esModule: true, default: BottomSheet, BottomSheetView };
});
