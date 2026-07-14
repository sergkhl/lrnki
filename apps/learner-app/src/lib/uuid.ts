// Client-created idempotency handles for Recall Challenge writes (plan 2026-07-13-003
// KTD2/KTD7): every answer submission mints ONE attemptRef and every lifecycle action ONE
// operationRef, held across retries so a replay returns the committed result instead of a
// second event. These are idempotency identities, not secrets — web has crypto.randomUUID,
// native Hermes may only expose getRandomValues, and the arithmetic fallback still yields a
// well-formed v4 the server's uuid validator accepts.
export function clientUuid(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < 16; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
