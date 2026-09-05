# Use one acquisition identity across Activity entry points

Status: Accepted

Support references reuse the target Activity's ordinary acquisition identity, so replay or another
entry point cannot award the same progress twice. Guardian responses have a separate challenge
identity and never change acquisition mastery or weekly acquisition points. Calibration is a
self-report governed by [the mastery decision](0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

The [learner-state types](../../packages/learner-runtime/src/learnerState.ts) own response shapes and
provenance. [The API boundary](0035-separate-learner-app-static-spa-typed-api.md) owns grading privacy.
