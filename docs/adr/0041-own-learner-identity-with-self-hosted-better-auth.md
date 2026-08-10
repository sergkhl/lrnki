# Own learner identity and sessions with self-hosted Better Auth

Status: Accepted

## Decision

Self-hosted Better Auth mounted inside learner-api is the only learner identity and session authority.
Google is the primary sign-in path; Better Auth email and password is the first-party fallback and the
path automated rigs exercise. Email verification and password reset remain deferred until an email
provider is selected rather than being mocked.

Both web and native clients use Better Auth cookie sessions; no bearer-token subsystem is retained.
The learner web origin must remain on the same registrable domain as the API so first-party cookie and
OAuth state behavior remain valid. Changing that origin is therefore an authentication decision, not
only a hosting change.

The application learner reference is Better Auth's user id, while the Better Auth user name owns the
chosen display name. Every request derives that identity server-side; learner routes never accept a
client-supplied learner reference.

Better Auth's generated tables remain under the code-first authority of
[ADR-0039](0039-own-persisted-shape-in-code-first-drizzle-schema.md). Required secrets, base-URL
checks, CORS origins, local OAuth constraints, and rotation effects belong to the root README
deployment runbook and the owning test-rig READMEs.

## Context

The former display-name, PIN, and hand-rolled bearer-token subsystem duplicated established
authentication work and made OAuth a second identity path. A maintained self-hosted framework keeps
credential, session, OAuth, and CSRF behavior behind one authority without adding an external auth
service.
