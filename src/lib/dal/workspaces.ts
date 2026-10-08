import { PoolClient } from 'pg';

export interface Workspace {
  id: string;
  name: string;
  createdAt: Date;
}

export async function listWorkspaces(client: PoolClient): Promise<Workspace[]> {
  const { rows } = await client.query(
    `SELECT id, name, created_at AS "createdAt" FROM workspaces ORDER BY name`
  );
  return rows;
}

export async function getWorkspace(
  client: PoolClient,
  workspaceId: string
): Promise<Workspace | null> {
  // RLS filters — non-member sees 0 rows (same as nonexistent).
  const { rows } = await client.query(
    'SELECT id, name, created_at AS "createdAt" FROM workspaces WHERE id = $1',
    [workspaceId]
  );
  return rows[0] ?? null;
}
