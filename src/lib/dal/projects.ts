import { PoolClient } from 'pg';

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  summary: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listProjects(
  client: PoolClient,
  workspaceId: string
): Promise<Project[]> {
  // Hierarchy validation: workspace_id in WHERE + RLS = double check.
  const { rows } = await client.query(
    `SELECT id, workspace_id AS "workspaceId", name, summary,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM projects
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );
  return rows;
}

export async function getProject(
  client: PoolClient,
  workspaceId: string,
  projectId: string
): Promise<Project | null> {
  // Both IDs validated — prevents cross-workspace IDOR.
  const { rows } = await client.query(
    `SELECT id, workspace_id AS "workspaceId", name, summary,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM projects
     WHERE id = $1 AND workspace_id = $2`,
    [projectId, workspaceId]
  );
  return rows[0] ?? null;
}

export async function createProject(
  client: PoolClient,
  workspaceId: string,
  name: string
): Promise<Project> {
  const { rows } = await client.query(
    `INSERT INTO projects (workspace_id, name)
     VALUES ($1, $2)
     RETURNING id, workspace_id AS "workspaceId", name, summary,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [workspaceId, name]
  );
  return rows[0];
}

export async function updateProject(
  client: PoolClient,
  workspaceId: string,
  projectId: string,
  name: string
): Promise<Project | null> {
  const { rows } = await client.query(
    `UPDATE projects SET name = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING id, workspace_id AS "workspaceId", name, summary,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [name, projectId, workspaceId]
  );
  return rows[0] ?? null;
}

export async function deleteProject(
  client: PoolClient,
  workspaceId: string,
  projectId: string
): Promise<boolean> {
  const result = await client.query(
    'DELETE FROM projects WHERE id = $1 AND workspace_id = $2',
    [projectId, workspaceId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateProjectSummary(
  client: PoolClient,
  workspaceId: string,
  projectId: string,
  summary: Record<string, unknown>
): Promise<boolean> {
  const result = await client.query(
    `UPDATE projects SET summary = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3`,
    [JSON.stringify(summary), projectId, workspaceId]
  );
  return (result.rowCount ?? 0) > 0;
}
