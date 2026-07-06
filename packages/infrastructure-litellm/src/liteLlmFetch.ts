import { Agent, fetch as undiciFetch } from "undici";

export type LiteLlmFetchInit = RequestInit & { dispatcher: Agent };
export type LiteLlmFetch = (url: string, init: LiteLlmFetchInit) => Promise<Response>;

let activeFetch = undiciFetch as unknown as LiteLlmFetch;

export function createLiteLlmDispatcher(timeoutMs: number): Agent {
  return new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs
  });
}

export function withLiteLlmDispatcher(init: RequestInit, dispatcher: Agent): LiteLlmFetchInit {
  return { ...init, dispatcher };
}

export function liteLlmFetch(url: string, init: LiteLlmFetchInit): Promise<Response> {
  return activeFetch(url, init);
}

export function setLiteLlmFetchForTests(fetchImpl: LiteLlmFetch): void {
  activeFetch = fetchImpl;
}

export function resetLiteLlmFetchForTests(): void {
  activeFetch = undiciFetch as unknown as LiteLlmFetch;
}
