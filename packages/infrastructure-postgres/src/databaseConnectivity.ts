// "Is the database unreachable right now?" — the one place that names the driver's connectivity
// vocabulary. A caller collapses a match to a one-line outage notice and DROPS the stack, so the
// closed sets below stay deliberately narrow: anything that could be a real defect (a constraint
// violation, a syntax error, a bad type) must fall through to full error reporting.
//
// Three vocabularies reach a caller, because postgres.js normalizes none of them:
//   - Node syscall/DNS codes. postgres.js does NOT wrap connect failures — `queryError` rejects
//     with the original Node error — and a multi-address host (`localhost` -> ::1 + 127.0.0.1)
//     arrives as an AggregateError carrying `code` plus per-address children.
//   - postgres.js's own `Errors.connection` literals, which set `code` to the string itself.
//   - SQLSTATE from a live server that is shutting down or refusing new work.
const NODE_CONNECTIVITY_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT"
]);

const DRIVER_CONNECTIVITY_CODES = new Set(["CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED", "CONNECT_TIMEOUT"]);

// 57P01 admin_shutdown, 57P02 crash_shutdown, 57P03 cannot_connect_now. Class 08 is deliberately
// excluded: postgres.js surfaces a broken socket through its own CONNECTION_* codes above, so
// adding it would only widen the stack-suppressing set without covering a reachable case.
const SERVER_UNAVAILABLE_SQLSTATES = new Set(["57P01", "57P02", "57P03"]);

// AggregateError children are themselves plain Errors, so one level is all the shape needs; the
// cap exists so a self-referential `errors` array cannot spin.
const MAX_NESTING_DEPTH = 3;

// Returns the connectivity code when the error means the database is unreachable, otherwise
// undefined. One function rather than a predicate plus an accessor: the caller needs the code for
// its log line, and a nested AggregateError is then walked once instead of twice.
export function databaseConnectivityFailureCode(error: unknown): string | undefined {
  return connectivityCodeAtDepth(error, 0);
}

function connectivityCodeAtDepth(error: unknown, depth: number): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && isConnectivityCode(code)) return code;
  if (depth >= MAX_NESTING_DEPTH) return undefined;
  const nested = (error as { errors?: unknown }).errors;
  if (!Array.isArray(nested)) return undefined;
  for (const child of nested) {
    const childCode = connectivityCodeAtDepth(child, depth + 1);
    if (childCode !== undefined) return childCode;
  }
  return undefined;
}

function isConnectivityCode(code: string): boolean {
  return NODE_CONNECTIVITY_CODES.has(code) || DRIVER_CONNECTIVITY_CODES.has(code) || SERVER_UNAVAILABLE_SQLSTATES.has(code);
}
