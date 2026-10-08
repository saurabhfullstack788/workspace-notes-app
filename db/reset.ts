import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/workspace_notes';

async function reset() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log('Dropping all tables...');
  await client.query(`
    DROP TABLE IF EXISTS notes CASCADE;
    DROP TABLE IF EXISTS projects CASCADE;
    DROP TABLE IF EXISTS memberships CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS workspaces CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP FUNCTION IF EXISTS prevent_project_reassignment CASCADE;
    DROP FUNCTION IF EXISTS prevent_note_reassignment CASCADE;
    DROP FUNCTION IF EXISTS prevent_membership_reassignment CASCADE;
    DROP FUNCTION IF EXISTS current_app_user_id CASCADE;
    DROP FUNCTION IF EXISTS my_workspace_ids CASCADE;
    DROP FUNCTION IF EXISTS my_writable_workspace_ids CASCADE;
    DROP FUNCTION IF EXISTS my_owned_workspace_ids CASCADE;
  `);

  console.log('Reset complete. Run migrations to recreate.');
  await client.end();
}

reset().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
