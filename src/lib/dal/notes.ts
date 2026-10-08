import { PoolClient } from 'pg';

export interface Note {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listNotes(
  client: PoolClient,
  workspaceId: string,
  projectId: string
): Promise<Note[]> {
  // Full hierarchy: join projects to validate workspace ownership.
  const { rows } = await client.query(
    `SELECT n.id, n.project_id AS "projectId", n.title, n.content,
            n.created_at AS "createdAt", n.updated_at AS "updatedAt"
     FROM notes n
     JOIN projects p ON n.project_id = p.id
     WHERE n.project_id = $1 AND p.workspace_id = $2
     ORDER BY n.created_at DESC`,
    [projectId, workspaceId]
  );
  return rows;
}

export async function getNote(
  client: PoolClient,
  workspaceId: string,
  projectId: string,
  noteId: string
): Promise<Note | null> {
  const { rows } = await client.query(
    `SELECT n.id, n.project_id AS "projectId", n.title, n.content,
            n.created_at AS "createdAt", n.updated_at AS "updatedAt"
     FROM notes n
     JOIN projects p ON n.project_id = p.id
     WHERE n.id = $1 AND n.project_id = $2 AND p.workspace_id = $3`,
    [noteId, projectId, workspaceId]
  );
  return rows[0] ?? null;
}

export async function createNote(
  client: PoolClient,
  workspaceId: string,
  projectId: string,
  title: string,
  content: string
): Promise<Note | null> {
  // Verify the project belongs to this workspace before inserting.
  // RLS also enforces this, but the hierarchy check prevents the note
  // from being created under a project in a different workspace.
  const { rows: projRows } = await client.query(
    'SELECT id FROM projects WHERE id = $1 AND workspace_id = $2',
    [projectId, workspaceId]
  );
  if (projRows.length === 0) return null;

  const { rows } = await client.query(
    `INSERT INTO notes (project_id, title, content)
     VALUES ($1, $2, $3)
     RETURNING id, project_id AS "projectId", title, content,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [projectId, title, content]
  );
  return rows[0];
}

export async function updateNote(
  client: PoolClient,
  workspaceId: string,
  projectId: string,
  noteId: string,
  data: { title?: string; content?: string }
): Promise<Note | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(data.title);
  }
  if (data.content !== undefined) {
    fields.push(`content = $${idx++}`);
    values.push(data.content);
  }
  if (fields.length === 0) return null;

  fields.push('updated_at = now()');
  values.push(noteId, projectId, workspaceId);

  const { rows } = await client.query(
    `UPDATE notes SET ${fields.join(', ')}
     FROM projects p
     WHERE notes.id = $${idx++}
       AND notes.project_id = $${idx++}
       AND p.id = notes.project_id
       AND p.workspace_id = $${idx}
     RETURNING notes.id, notes.project_id AS "projectId", notes.title,
               notes.content, notes.created_at AS "createdAt",
               notes.updated_at AS "updatedAt"`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteNote(
  client: PoolClient,
  workspaceId: string,
  projectId: string,
  noteId: string
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM notes
     USING projects p
     WHERE notes.id = $1
       AND notes.project_id = $2
       AND p.id = notes.project_id
       AND p.workspace_id = $3`,
    [noteId, projectId, workspaceId]
  );
  return (result.rowCount ?? 0) > 0;
}
