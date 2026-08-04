DO $reset$
BEGIN
  IF current_database() NOT IN ('lrnki', 'lrnki_test') THEN
    RAISE EXCEPTION 'refusing to reset database %', current_database();
  END IF;
END
$reset$;

DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
