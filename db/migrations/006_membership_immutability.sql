-- Prevent reassigning membership to a different workspace or user after creation.
-- Matches the immutability triggers already on projects.workspace_id and notes.project_id.

CREATE OR REPLACE FUNCTION prevent_membership_reassignment() RETURNS trigger AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'Cannot change workspace_id on membership';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change user_id on membership';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_membership_reassignment ON memberships;
CREATE TRIGGER no_membership_reassignment
  BEFORE UPDATE ON memberships FOR EACH ROW
  EXECUTE FUNCTION prevent_membership_reassignment();
