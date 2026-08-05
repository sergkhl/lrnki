-- Browser e2e tests and the DB-backed suites reset the application schema between cases. Keep that
-- destructive reset off the dev database by giving the test suite its own database in the same
-- instance (same isolation rationale as the litellm database, and see scripts/test-db.sh).
CREATE DATABASE lrnki_test;
