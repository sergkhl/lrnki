# Blockers

- **Run DB-backed real-use validation for calibration pre-study flow.** `DATABASE_URL` is unset in
  the current environment, so the Admin Lab calibration/study route cannot be exercised against a
  seeded curated enrichment in browser. Needed before claiming rule-13/14 real-use quality for the
  learner-facing UI.
