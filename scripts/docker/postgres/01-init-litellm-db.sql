-- LiteLLM runs Prisma post-migration sanity checks against its DATABASE_URL.
-- Keep proxy state in a dedicated database so it cannot drop lrnki app tables.
--
-- Plain SQL, not a shell script: the Postgres entrypoint feeds *.sql straight to psql, so this
-- initializer needs neither an executable bit nor an interpreter. A bind-mounted *.sh initializer
-- depends on both surviving the host's file sharing, which is not portable across Docker hosts.
CREATE DATABASE litellm;
