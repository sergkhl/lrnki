// Type-only client contract (R1): web (and later Expo) import `AppType` here and get
// end-to-end request/response types through `hono/client` with no codegen.
export type { AppType, LearnerGradingResult, LearnerMatchingAttemptResult, LearnerMatchingResult } from "./app";
export type { LeaderboardView } from "./leaderboard";
// The identity half of the same contract (ADR-0041). `/auth/*` is deliberately outside
// `AppType`, so the app reaches it through Better Auth's own client — but that client still
// has to be told about this server's `user` additional fields, and this type is what tells
// it. Exporting the instance type keeps `profileComplete` defined in exactly one place.
export type { LearnerAuth } from "./auth";
