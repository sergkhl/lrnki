# Own learner identity and sessions with self-hosted Better Auth

Status: Accepted

Self-hosted Better Auth inside learner-api is the sole identity/session authority. Google is the
primary sign-in path; email/password is the first-party fallback exercised by automated rigs.
Email verification and password reset remain deferred until an email provider is selected.

Web and native use cookie sessions, without a parallel bearer-token subsystem. The web origin must
share the API's registrable domain for first-party cookie and OAuth state behavior; moving it is an
authentication decision as well as a hosting change.

Better Auth's user id owns the learner reference and its user name owns the chosen display name.
Requests derive identity server-side and never accept a client-supplied learner reference.

This keeps credential, session, OAuth, and CSRF handling behind a maintained framework without an
external auth service. [ADR-0039](0039-own-persisted-shape-in-code-first-drizzle-schema.md) owns schema
lineage; [the authentication runbook](../../README.md#authentication) owns configuration and rotation.
