import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "lrnki_learner_token";

// Opaque bearer token (KTD3), same contract as the web SPA kept in localStorage — native
// keeps it in SecureStore. SecureStore reads are async, so the store hydrates an in-memory
// mirror once at app boot and the `hc` headers callback stays synchronous; writes go
// through to storage.
let mirror: string | null = null;

export async function hydrateToken(): Promise<void> {
  mirror = await SecureStore.getItemAsync(TOKEN_KEY);
}

export function readToken(): string | null {
  return mirror;
}

export function writeToken(token: string): void {
  mirror = token;
  void SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearToken(): void {
  mirror = null;
  void SecureStore.deleteItemAsync(TOKEN_KEY);
}
