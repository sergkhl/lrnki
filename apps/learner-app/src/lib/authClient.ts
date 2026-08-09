import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { LearnerAuth } from "@lrnki/learner-api/client";

// Single working environment during testing (ADR-0036): the app defaults to the deployed
// learner-api. Set EXPO_PUBLIC_LEARNER_API_URL to point at a local API instead. It lives HERE
// rather than beside the RPC client because the dependency has to point one way: `api.ts`
// needs this module for the session transport, so this module can import nothing from it.
export const API_URL: string = process.env.EXPO_PUBLIC_LEARNER_API_URL ?? "https://api.lrnki.globesoul.com";

const IS_WEB = Platform.OS === "web";

// `@better-auth/expo@1.6.26` publishes a `getActions` whose `$fetch` parameter is a different
// `BetterFetch` instantiation than `BetterAuthClientPlugin` declares. `BetterFetch` is a generic
// *function* type, so under `strictFunctionTypes` that parameter is compared contravariantly and
// the plugin is not assignable to the interface it implements — a defect in its `.d.ts`, not in
// its behavior. Left alone, the whole `plugins` tuple fails to infer, which silently takes
// `inferAdditionalFields` down with it and erases `profileComplete` everywhere.
// The override restates exactly one declaration and nothing else: `getActions` ignores both
// arguments at runtime, so dropping them from the type is a narrowing the implementation already
// satisfies, and the action it contributes stays precisely typed rather than collapsing to
// `Record<string, any>` — which would make every `authClient.*` typo an `any`.
type ExpoSessionPlugin = Omit<ReturnType<typeof expoClient>, "getActions"> & {
  getActions: () => { getCookie: () => string };
};

// The ONE identity client (ADR-0041), matching the server's `basePath: "/auth"`. No React
// binding and no `useSession`: `meQuery` is the app's only session state machine (KTD1), and a
// second reactive source of "am I signed in" is exactly the duplicate representation rule 18
// forbids. `inferAdditionalFields` reads `profileComplete` off the server's own instance type,
// so the first-run naming gate (D7) cannot drift from the column that gates it.
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/auth",
  // Web only: the cookie is HttpOnly and cross-origin (Pages ↔ VPS api), so every auth call
  // must opt in or the browser neither sends nor stores it. The expo plugin sets its own
  // credentials mode on native, where there is no browser jar to opt into.
  ...(IS_WEB ? { fetchOptions: { credentials: "include" as const } } : {}),
  plugins: [
    // On web this plugin short-circuits every hook and defers to the browser's cookie jar;
    // on native it mirrors the session cookie into SecureStore and drives the system-browser
    // OAuth leg. `scheme` matches `app.config.ts` — the `lrnki://` return leg (D5).
    expoClient({ scheme: "lrnki", storagePrefix: "lrnki", storage: SecureStore }) as ExpoSessionPlugin,
    inferAdditionalFields<LearnerAuth>()
  ]
});

// How a learner-domain request carries the session, owned in one place because the two
// platforms answer it differently and neither answer is the other's default:
//   - Web: the browser holds an HttpOnly cookie the app can never read, and sends it only
//     when the request opts in — a header would be impossible and is not attempted.
//   - Native: React Native's fetch jar is NOT the system browser's, so the OAuth leg's cookie
//     would never reach it. The expo plugin's SecureStore copy is attached by hand instead,
//     and the jar is explicitly kept out of the request so it cannot contribute a stale one.
// The callback stays synchronous: `SecureStore.getItem` is the sync read, so no boot-time
// hydration step is needed the way the retired bearer mirror needed one.
export const sessionTransport = {
  init: { credentials: IS_WEB ? "include" : "omit" } as RequestInit,
  headers: (): Record<string, string> => {
    if (IS_WEB) return {};
    const cookie = authClient.getCookie();
    return cookie ? { cookie } : {};
  }
};

// Where the OAuth leg sends the browser when it ends, success or failure. The platforms need
// OPPOSITE forms here, and each one's answer is broken on the other:
//   - Web: ABSOLUTE. Better Auth copies this value verbatim into the callback's `Location`, so
//     a relative path resolves against the API host and lands a successful sign-in on
//     `https://api.…/` — a 404 with no route back to the app.
//   - Native: RELATIVE. The expo client rewrites a relative value into the `lrnki://` return
//     leg (D5); an absolute https URL would send the device to the website instead.
// The web origin must also be same-site with `API_URL` for the leg to complete at all — that
// invariant belongs to ADR-0041, not to this comment.
// `window` is read per call, never at module scope, so importing this universal module never
// requires a browser global during bundling or on native.
export function oauthReturnURL(): string {
  return IS_WEB ? `${window.location.origin}/` : "/";
}
