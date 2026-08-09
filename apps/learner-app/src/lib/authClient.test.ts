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
function loadAuthClient(os: "web" | "android") {
  let loaded!: typeof import("./authClient");
  // `require` inside `isolateModules`, not `await import`: the runner is CJS, so a dynamic
  // import throws "A dynamic import callback was invoked without --experimental-vm-modules".
  jest.isolateModules(() => {
    jest.doMock("react-native", () => ({ Platform: { OS: os } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("./authClient") as typeof import("./authClient");
  });
  return loaded;
}

// The runner is a node environment with React Native's export conditions — there is no DOM, so
// the web branch's one global is supplied and removed around the call rather than left standing
// for the native cases, which must prove they never reach for it.
function withWindow<T>(stub: { location: { origin: string } }, run: () => T): T {
  const target = globalThis as unknown as { window?: unknown };
  const had = "window" in target;
  const previous = target.window;
  target.window = stub;
  try {
    return run();
  } finally {
    if (had) target.window = previous;
    else delete target.window;
  }
}

beforeEach(() => {
  mockStoredCookie = "";
  jest.clearAllMocks();
});

test("web opts the browser's HttpOnly cookie in, and never invents a cookie header", () => {
  mockStoredCookie = "lrnki.session_token=leaked";
  const { sessionTransport: transport } = loadAuthClient("web");

  // The cookie is cross-origin (Pages web ↔ VPS api) and HttpOnly: without `include` the
  // browser neither sends nor stores it, and a header is impossible — reading one here could
  // only mean the app is holding a credential it must not have.
  expect(transport.init.credentials).toBe("include");
  expect(transport.headers()).toEqual({});
});

test("native attaches the stored cookie by hand and keeps the fetch jar out of the request", () => {
  mockStoredCookie = "lrnki.session_token=abc123";
  const { sessionTransport: transport } = loadAuthClient("android");

  // React Native's fetch jar is not the system browser's, so the OAuth leg's cookie can only
  // arrive this way; `omit` stops the jar contributing a second, stale one alongside it.
  expect(transport.headers()).toEqual({ cookie: "lrnki.session_token=abc123" });
  expect(transport.init.credentials).toBe("omit");
});

test("a signed-out native request sends no cookie header at all", () => {
  const { sessionTransport: transport } = loadAuthClient("android");

  // The plugin answers "" before sign-in. An empty `cookie:` header would still be a header,
  // and the API's 401 surface must see a request with no credential rather than a blank one.
  expect(transport.headers()).toEqual({});
});

test("the web OAuth return URL is absolute, so the callback cannot resolve it against the API", () => {
  const { oauthReturnURL } = loadAuthClient("web");

  // Better Auth emits this value verbatim as the callback's `Location`. Relative here means
  // `https://api.lrnki.globesoul.com/` — a 404 the learner has no route back from, which is
  // exactly what a successful sign-in used to land on.
  const returnURL = withWindow({ location: { origin: "https://lrnki.globesoul.com" } }, oauthReturnURL);

  expect(returnURL).toBe("https://lrnki.globesoul.com/");
});

test("the native OAuth return URL stays relative, so the expo client can rewrite it to `lrnki://`", () => {
  const { oauthReturnURL } = loadAuthClient("android");

  // The mirror image of the web case: an absolute https URL here would send the device to the
  // website instead of back into the app, and no `window` may be touched to decide it.
  expect(oauthReturnURL()).toBe("/");
});
