-- Browser e2e tests and the DB-backed suites reset the application schema between cases. Keep that
-- destructive reset off the dev database by giving the test suite its own database in the same
-- instance (see scripts/test-db.sh for the fail-closed test-database contract).
CREATE DATABASE lrnki_test;
