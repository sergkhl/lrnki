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
    FadeInDown: { duration: (duration) => ({ direction: "down", duration }) },
    FadeInRight: { duration: (duration) => ({ direction: "right", duration }) },
    Easing: new Proxy({}, { get: () => (x) => (typeof x === "number" ? x : (y) => y) }),
    __pressable: Pressable
  };
});

// NativeWind's Metro import rewrite only matters for real rendering; in tests className
// props remain inert strings and the animated styling bridge is an identity wrapper.
jest.mock("nativewind", () => ({
  __esModule: true,
  styled: jest.fn((Component) => Component),
  useColorScheme: () => ({ colorScheme: "light" })
}));

// Fonts resolve as instantly loaded (plan 2026-07-18-001 KTD4): components assert the
// family name, never real glyph loading; the google-fonts module is mocked so jest
// never requires its bundled .ttf asset.
jest.mock("expo-font", () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true)
}));
jest.mock("@expo-google-fonts/im-fell-english", () => ({
  IMFellEnglish_400Regular: "IMFellEnglish_400Regular"
}));

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
    return React.createElement(
      View,
      { testID: "bottom-sheet", accessibilityViewIsModal: true, onClose, ...propsForFake(rest) },
      children
    );
  };
  const propsForFake = ({ enablePanDownToClose }) => ({ accessibilityHint: enablePanDownToClose ? "pan-enabled" : "pan-disabled" });
  const BottomSheetView = ({ children, ...props }) => React.createElement(View, props, children);
  return { __esModule: true, default: BottomSheet, BottomSheetView };
});

// `lib/authClient.ts` puts the Better Auth client in the module graph of every screen that makes
// a request, and that client is ESM-only across a deep chain — better-call, @better-fetch,
// @noble/hashes. Transforming it costs the whole suite roughly 3x its runtime to load a
// crypto/JWT stack no assertion touches, and each release adds another package to chase. It is
// stubbed here instead, the same way Reanimated and Expo UI are.
//
// What still guards the seam: `pnpm typecheck` compiles `lib/authClient.ts` against the REAL
// declarations, so a renamed export or a changed signature fails there rather than passing green
// here. The client's behaviour is covered where it is real — the e2e and real-use rigs, and the
// deployed-stack gate. Suites needing a different stub re-mock these specifiers themselves.
jest.mock("better-auth/client", () => ({ createAuthClient: () => ({ getCookie: () => "" }) }));
jest.mock("better-auth/client/plugins", () => ({ inferAdditionalFields: () => ({ id: "additional-fields" }) }));
jest.mock("@better-auth/expo/client", () => ({ expoClient: () => ({ id: "expo" }) }));
