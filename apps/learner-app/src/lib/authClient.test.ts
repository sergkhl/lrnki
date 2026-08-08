import { beforeEach, expect, jest, test } from "@jest/globals";

// Better Auth and the Expo plugin are stubbed, not exercised: what is under test is this repo's
// platform branch, the one place where getting a request's session transport backwards is a
// silent sign-out on exactly one platform. The stub is the seam the branch actually consumes —
// `getCookie` from the plugin's actions, forwarded through `createAuthClient`.
// The `mock` prefix is load-bearing: jest hoists a mock factory above every import, so only a
// `mock*` binding may be referenced from inside one.
let mockStoredCookie = "";
jest.mock("expo-secure-store", () => ({ getItem: jest.fn(() => null), setItem: jest.fn() }));
jest.mock("@better-auth/expo/client", () => ({ expoClient: jest.fn(() => ({ id: "expo" })) }));
jest.mock("better-auth/client/plugins", () => ({ inferAdditionalFields: jest.fn(() => ({ id: "additional-fields" })) }));
jest.mock("better-auth/client", () => ({
  createAuthClient: jest.fn(() => ({ getCookie: () => mockStoredCookie }))
}));

// Each case loads the module fresh under a chosen `Platform.OS`, because the branch is decided
// once at module scope — a per-call `Platform` read would be a different design and would not
// prove this one.
function loadTransport(os: "web" | "android") {
  let transport!: typeof import("./authClient").sessionTransport;
  // `require` inside `isolateModules`, not `await import`: the runner is CJS, so a dynamic
  // import throws "A dynamic import callback was invoked without --experimental-vm-modules".
  jest.isolateModules(() => {
    jest.doMock("react-native", () => ({ Platform: { OS: os } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    transport = (require("./authClient") as typeof import("./authClient")).sessionTransport;
  });
  return transport;
}

beforeEach(() => {
  mockStoredCookie = "";
  jest.clearAllMocks();
});

test("web opts the browser's HttpOnly cookie in, and never invents a cookie header", () => {
  mockStoredCookie = "lrnki.session_token=leaked";
  const transport = loadTransport("web");

  // The cookie is cross-origin (Pages web ↔ VPS api) and HttpOnly: without `include` the
  // browser neither sends nor stores it, and a header is impossible — reading one here could
  // only mean the app is holding a credential it must not have.
  expect(transport.init.credentials).toBe("include");
  expect(transport.headers()).toEqual({});
});

test("native attaches the stored cookie by hand and keeps the fetch jar out of the request", () => {
  mockStoredCookie = "lrnki.session_token=abc123";
  const transport = loadTransport("android");

  // React Native's fetch jar is not the system browser's, so the OAuth leg's cookie can only
  // arrive this way; `omit` stops the jar contributing a second, stale one alongside it.
  expect(transport.headers()).toEqual({ cookie: "lrnki.session_token=abc123" });
  expect(transport.init.credentials).toBe("omit");
});

test("a signed-out native request sends no cookie header at all", () => {
  const transport = loadTransport("android");

  // The plugin answers "" before sign-in. An empty `cookie:` header would still be a header,
  // and the API's 401 surface must see a request with no credential rather than a blank one.
  expect(transport.headers()).toEqual({});
});
