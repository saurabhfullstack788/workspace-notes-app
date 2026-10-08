-- Row-Level Security: deny-by-default on all tenant tables.
--
-- Architecture:
--   1. current_app_user_id()  — reads the GUC, fails if unset (VOLATILE)
--   2. my_workspace_ids()     — SECURITY DEFINER, bypasses RLS on memberships
--                                to break the self-referencing policy problem
--   3. Per-command policies    — no FOR ALL, WITH CHECK on all writes
--   4. Immutability triggers   — in 002_tables.sql

------------------------------------------------------------------------
-- Helper functions
------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS uuid AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('app.current_user_id', false);
  IF raw IS NULL OR raw = '' THEN
    RAISE EXCEPTION 'app.current_user_id is not set';
  END IF;
  RETURN raw::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- SECURITY DEFINER: runs as the function owner (postgres/migration role),
-- bypassing RLS on the memberships table.  Returns only the workspace IDs
-- for the user identified by the GUC — cannot be parameterised with an
-- arbitrary user ID.
CREATE OR REPLACE FUNCTION my_workspace_ids() RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM memberships
  WHERE user_id = current_setting('app.current_user_id', false)::uuid;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

-- Helper: workspace IDs where the current user has editor or owner role
CREATE OR REPLACE FUNCTION my_writable_workspace_ids() RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM memberships
  WHERE user_id = current_setting('app.current_user_id', false)::uuid
    AND role IN ('owner', 'editor');
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

-- Helper: workspace IDs where the current user is an owner
CREATE OR REPLACE FUNCTION my_owned_workspace_ids() RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM memberships
  WHERE user_id = current_setting('app.current_user_id', false)::uuid
    AND role = 'owner';
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

-- Grant execute to app_user, revoke from PUBLIC
REVOKE ALL ON FUNCTION current_app_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_app_user_id() TO app_user;

REVOKE ALL ON FUNCTION my_workspace_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_workspace_ids() TO app_user;

REVOKE ALL ON FUNCTION my_writable_workspace_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_writable_workspace_ids() TO app_user;

REVOKE ALL ON FUNCTION my_owned_workspace_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_owned_workspace_ids() TO app_user;

------------------------------------------------------------------------
-- WORKSPACES
------------------------------------------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select ON workspaces;
CREATE POLICY ws_select ON workspaces FOR SELECT
  USING (id IN (SELECT my_workspace_ids()));

DROP POLICY IF EXISTS ws_update ON workspaces;
CREATE POLICY ws_update ON workspaces FOR UPDATE
  USING (id IN (SELECT my_owned_workspace_ids()))
  WITH CHECK (id IN (SELECT my_owned_workspace_ids()));

DROP POLICY IF EXISTS ws_delete ON workspaces;
CREATE POLICY ws_delete ON workspaces FOR DELETE
  USING (id IN (SELECT my_owned_workspace_ids()));

-- No INSERT policy: workspaces are created via seed or a SECURITY DEFINER function

------------------------------------------------------------------------
-- MEMBERSHIPS
------------------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mem_select ON memberships;
CREATE POLICY mem_select ON memberships FOR SELECT
  USING (workspace_id IN (SELECT my_workspace_ids()));

DROP POLICY IF EXISTS mem_insert ON memberships;
CREATE POLICY mem_insert ON memberships FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT my_owned_workspace_ids())
    AND user_id != current_app_user_id()
  );

DROP POLICY IF EXISTS mem_update ON memberships;
CREATE POLICY mem_update ON memberships FOR UPDATE
  USING (
    workspace_id IN (SELECT my_owned_workspace_ids())
    AND user_id != current_app_user_id()
  )
  WITH CHECK (
    workspace_id IN (SELECT my_owned_workspace_ids())
    AND user_id != current_app_user_id()
  );

DROP POLICY IF EXISTS mem_delete ON memberships;
CREATE POLICY mem_delete ON memberships FOR DELETE
  USING (
    workspace_id IN (SELECT my_owned_workspace_ids())
    AND user_id != current_app_user_id()
  );

------------------------------------------------------------------------
-- PROJECTS
------------------------------------------------------------------------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proj_select ON projects;
CREATE POLICY proj_select ON projects FOR SELECT
  USING (workspace_id IN (SELECT my_workspace_ids()));

DROP POLICY IF EXISTS proj_insert ON projects;
CREATE POLICY proj_insert ON projects FOR INSERT
  WITH CHECK (workspace_id IN (SELECT my_writable_workspace_ids()));

DROP POLICY IF EXISTS proj_update ON projects;
CREATE POLICY proj_update ON projects FOR UPDATE
  USING (workspace_id IN (SELECT my_writable_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT my_writable_workspace_ids()));

DROP POLICY IF EXISTS proj_delete ON projects;
CREATE POLICY proj_delete ON projects FOR DELETE
  USING (workspace_id IN (SELECT my_writable_workspace_ids()));

------------------------------------------------------------------------
-- NOTES
------------------------------------------------------------------------
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS note_select ON notes;
CREATE POLICY note_select ON notes FOR SELECT
  USING (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT my_workspace_ids())
  ));

DROP POLICY IF EXISTS note_insert ON notes;
CREATE POLICY note_insert ON notes FOR INSERT
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT my_writable_workspace_ids())
  ));

DROP POLICY IF EXISTS note_update ON notes;
CREATE POLICY note_update ON notes FOR UPDATE
  USING (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT my_writable_workspace_ids())
  ))
  WITH CHECK (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT my_writable_workspace_ids())
  ));

DROP POLICY IF EXISTS note_delete ON notes;
CREATE POLICY note_delete ON notes FOR DELETE
  USING (project_id IN (
    SELECT id FROM projects WHERE workspace_id IN (SELECT my_writable_workspace_ids())
  ));
