import assert from "node:assert/strict";
import test from "node:test";
import { databaseConnectivityFailureCode } from "./databaseConnectivity";

// The shape the learner-api crash actually produced: postgres.js does not wrap connect failures,
// and a multi-address `localhost` (::1 + 127.0.0.1) reaches the caller as a Node AggregateError.
test("an AggregateError from a refused multi-address connect reports its child code", () => {
  const aggregate = new AggregateError(
    [
      Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED", address: "::1", port: 5432 }),
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED", address: "127.0.0.1", port: 5432 })
    ],
    "ECONNREFUSED"
  );

  assert.equal(databaseConnectivityFailureCode(aggregate), "ECONNREFUSED");
});

test("a top-level Node syscall code is reported without any nesting", () => {
  assert.equal(databaseConnectivityFailureCode(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), "ECONNRESET");
  assert.equal(databaseConnectivityFailureCode(Object.assign(new Error("getaddrinfo ENOTFOUND db"), { code: "ENOTFOUND" })), "ENOTFOUND");
});

// postgres.js `Errors.connection` sets `code` to the literal string rather than a numeric errno.
test("postgres.js connection codes are reported", () => {
  for (const code of ["CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED", "CONNECT_TIMEOUT"]) {
    assert.equal(databaseConnectivityFailureCode(Object.assign(new Error(`write ${code} 127.0.0.1:5432`), { code })), code);
  }
});

test("a server that is shutting down or refusing connections is reported", () => {
  assert.equal(databaseConnectivityFailureCode(Object.assign(new Error("terminating connection"), { code: "57P01" })), "57P01");
  assert.equal(databaseConnectivityFailureCode(Object.assign(new Error("not accepting connections"), { code: "57P03" })), "57P03");
});

// THE load-bearing case. A match suppresses the stack at the call site, so a real defect must never
// be mistaken for an outage — a unique violation is a bug to read, not a connection to wait out.
test("ordinary server and application errors are not connectivity failures", () => {
  assert.equal(databaseConnectivityFailureCode(Object.assign(new Error("duplicate key value"), { code: "23505" })), undefined);
  assert.equal(databaseConnectivityFailureCode(Object.assign(new Error("syntax error at or near"), { code: "42601" })), undefined);
  // Class 08 is deliberately excluded: postgres.js reports a broken socket as CONNECTION_*.
  assert.equal(databaseConnectivityFailureCode(Object.assign(new Error("connection failure"), { code: "08006" })), undefined);
  assert.equal(databaseConnectivityFailureCode(new Error("Scouting produced no concepts.")), undefined);
  assert.equal(databaseConnectivityFailureCode("ECONNREFUSED"), undefined);
  assert.equal(databaseConnectivityFailureCode(undefined), undefined);
  assert.equal(databaseConnectivityFailureCode(null), undefined);
});

// An AggregateError of unrelated failures must not be swallowed just because it is an aggregate.
test("an aggregate carrying no connectivity child is not a connectivity failure", () => {
  const aggregate = new AggregateError([new Error("model failed"), Object.assign(new Error("duplicate key"), { code: "23505" })]);

  assert.equal(databaseConnectivityFailureCode(aggregate), undefined);
});

test("a self-referential errors array terminates instead of spinning", () => {
  const cyclic: { errors: unknown[] } = { errors: [] };
  cyclic.errors.push(cyclic);

  assert.equal(databaseConnectivityFailureCode(cyclic), undefined);
});
