const TOKEN_KEY = "lrnki_learner_token";

// Web half of the token seam: localStorage is synchronous, so hydrate is a no-op. XSS
// exposure is accepted for a PIN-gated learning app (recorded in ADR-0035).
export async function hydrateToken(): Promise<void> {}

export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function writeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
