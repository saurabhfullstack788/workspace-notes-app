import { PoolClient } from 'pg';

export type Role = 'owner' | 'editor' | 'viewer';

export interface Membership {
  id: string;
  userId: string;
  workspaceId: string;
  role: Role;
  userName?: string;
  userEmail?: string;
}

export async function getMembership(
  client: PoolClient,
  workspaceId: string
): Promise<Membership | null> {
  // RLS filters by current_app_user_id — if no membership exists
  // for this user+workspace, returns 0 rows (same as nonexistent workspace).
  const { rows } = await client.query(
    `SELECT m.id, m.user_id AS "userId", m.workspace_id AS "workspaceId", m.role
     FROM memberships m
     WHERE m.workspace_id = $1
       AND m.user_id = current_app_user_id()`,
    [workspaceId]
  );
  return rows[0] ?? null;
}

export async function getMembers(
  client: PoolClient,
  workspaceId: string
): Promise<Membership[]> {
  const { rows } = await client.query(
    `SELECT m.id, m.user_id AS "userId", m.workspace_id AS "workspaceId",
            m.role, u.name AS "userName", u.email AS "userEmail"
     FROM memberships m
     JOIN users u ON m.user_id = u.id
     WHERE m.workspace_id = $1
     ORDER BY m.role, u.name`,
    [workspaceId]
  );
  return rows;
}

export async function addMember(
  client: PoolClient,
  workspaceId: string,
  targetUserId: string,
  role: Role
): Promise<void> {
  // RLS INSERT policy requires caller to be owner and target != self.
  // ON CONFLICT DO NOTHING prevents duplicate errors and info leakage.
  await client.query(
    `INSERT INTO memberships (user_id, workspace_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, workspace_id) DO NOTHING`,
    [targetUserId, workspaceId, role]
  );
}
