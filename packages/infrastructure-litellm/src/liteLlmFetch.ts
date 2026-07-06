import { Agent, fetch as undiciFetch } from "undici";

export type LiteLlmFetchInit = RequestInit & { dispatcher: Agent };
export type LiteLlmFetch = (url: string, init: LiteLlmFetchInit) => Promise<Response>;

let activeFetch = undiciFetch as unknown as LiteLlmFetch;

// One module-scoped dispatcher per distinct timeout: clients (and generation runs)
// come and go, but undici Agents hold sockets and are never closed by callers — so
// they must be shared, not constructed per client.
const dispatchersByTimeout = new Map<number, Agent>();

export function createLiteLlmDispatcher(timeoutMs: number): Agent {
  let dispatcher = dispatchersByTimeout.get(timeoutMs);
  if (!dispatcher) {
    dispatcher = new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs
    });
    dispatchersByTimeout.set(timeoutMs, dispatcher);
  }
  return dispatcher;
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
