# Use authored activity families and one learner-response identity

Status: Accepted

## Decision

Each Stop owns authored option-select, matching, and optional impostor Activities. Answer material is
server-private; the learner API sends only playable pre-answer projections and returns explanation
after grading.

An acquisition response is identified by learner, Expedition revision, Stop, Activity, and source
context. A Support Path that references an Activity reuses that ordinary acquisition identity rather
than cloning evidence. Guardian responses remain a separate challenge identity and never change
acquisition mastery or weekly acquisition points.

Calibration is an explicit self-report, not a graded response. Exact unions and payloads remain
source-owned.

## Context

Typed play supports distinct mechanics, while one response identity prevents replay, Support reuse,
and challenge play from awarding the same learning progress through competing paths.
