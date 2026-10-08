-- Create the runtime database role (NOSUPERUSER, NOBYPASSRLS).
-- The application connects as this role; RLS is always enforced.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'app_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE workspace_notes TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
