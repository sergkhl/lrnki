# Physical-device validation

Physical-device runs are user-initiated. Do not infer permission from an attached device, emulator
authority, or a request to implement code.

Before a requested run, record platform/model/OS, app build identity, API target, account class, and
the exact scenario. Keep secrets and one-time codes with the user. Do not display, copy, or retain
authentication codes.

A physical pass can correlate a native negative-control rig with real touch, layout, haptics,
keyboard, network, and lifecycle behavior. It still does not imply a signed distributable, store
review, rollout, other devices, or production acceptance.

If an active plan genuinely requires a user action, put one concrete action in
`docs/plans/BLOCKERS.md`. Do not create a blocker merely because physical evidence would be nice to
have when the plan explicitly excludes it.
