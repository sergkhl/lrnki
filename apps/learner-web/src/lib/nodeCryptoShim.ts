// Browser stand-in for `node:crypto`, aliased in vite.config. The application barrel
// imports it at module scope for server-side paths (PIN hashing, pipeline UUIDs); the
// SPA only executes the pure projection code, so hashing must never be reached here.
export function randomUUID(): string {
  return crypto.randomUUID();
}

export function createHash(): never {
  throw new Error("node:crypto.createHash is server-only");
}

export function timingSafeEqual(): never {
  throw new Error("node:crypto.timingSafeEqual is server-only");
}
