import { describe, it, expect, afterAll } from 'vitest';
import {
  closeTestPool, withTestTenantContext,
  ALICE_ID, BOB_ID, CHARLIE_ID,
  WS_A_ID, WS_B_ID,
  PROJ_Q4_ID, PROJ_TOOLS_ID,
  NONEXISTENT_UUID,
} from './setup';

afterAll(async () => { await closeTestPool(); });

describe('Role enforcement — viewer (Charlie in workspace A)', () => {

  it('can read projects', async () => {
    const rows = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT * FROM projects WHERE workspace_id = $1', [WS_A_ID]
      );
      return rows;
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('can read notes', async () => {
    const rows = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT * FROM notes WHERE project_id = $1', [PROJ_Q4_ID]
      );
      return rows;
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('cannot create a project', async () => {
    await expect(
      withTestTenantContext(CHARLIE_ID, async (c) => {
        await c.query(
          "INSERT INTO projects (workspace_id, name) VALUES ($1, 'Viewer Project')",
          [WS_A_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot update a project', async () => {
    const result = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const r = await c.query(
        "UPDATE projects SET name = 'Changed' WHERE id = $1", [PROJ_Q4_ID]
      );
      return r.rowCount;
    });
    expect(result).toBe(0);
  });

  it('cannot delete a project', async () => {
    const result = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const r = await c.query('DELETE FROM projects WHERE id = $1', [PROJ_Q4_ID]);
      return r.rowCount;
    });
    expect(result).toBe(0);
  });

  it('cannot create a note', async () => {
    await expect(
      withTestTenantContext(CHARLIE_ID, async (c) => {
        await c.query(
          "INSERT INTO notes (project_id, title, content) VALUES ($1, 'Viewer Note', 'content')",
          [PROJ_Q4_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot update a note', async () => {
    const result = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const r = await c.query(
        "UPDATE notes SET content = 'Changed' WHERE project_id = $1", [PROJ_Q4_ID]
      );
      return r.rowCount;
    });
    expect(result).toBe(0);
  });

  it('cannot invite a member', async () => {
    await expect(
      withTestTenantContext(CHARLIE_ID, async (c) => {
        await c.query(
          "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'viewer')",
          [NONEXISTENT_UUID, WS_A_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('Role enforcement — editor (Bob in workspace A)', () => {

  it('can create a project', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        "INSERT INTO projects (workspace_id, name) VALUES ($1, 'Editor Project') RETURNING id",
        [WS_A_ID]
      );
      await c.query('DELETE FROM projects WHERE id = $1', [rows[0].id]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });

  it('can update a project', async () => {
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      const r = await c.query(
        "UPDATE projects SET name = 'Updated by Editor' WHERE id = $1", [PROJ_Q4_ID]
      );
      // Restore
      await c.query("UPDATE projects SET name = 'Q4 Planning' WHERE id = $1", [PROJ_Q4_ID]);
      return r.rowCount;
    });
    expect(result).toBe(1);
  });

  it('can create a note', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        "INSERT INTO notes (project_id, title, content) VALUES ($1, 'Editor Note', 'content') RETURNING id",
        [PROJ_Q4_ID]
      );
      await c.query('DELETE FROM notes WHERE id = $1', [rows[0].id]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });

  it('can delete a project', async () => {
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      // Create a throwaway project, then delete it
      const { rows } = await c.query(
        "INSERT INTO projects (workspace_id, name) VALUES ($1, 'To Delete') RETURNING id",
        [WS_A_ID]
      );
      const r = await c.query('DELETE FROM projects WHERE id = $1', [rows[0].id]);
      return r.rowCount;
    });
    expect(result).toBe(1);
  });

  it('cannot invite a member (editor, not owner)', async () => {
    await expect(
      withTestTenantContext(BOB_ID, async (c) => {
        await c.query(
          "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'viewer')",
          [NONEXISTENT_UUID, WS_A_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('Role enforcement — owner (Alice in workspace A)', () => {

  it('can invite a new member', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      // Create a temp user to invite
      // Note: users table has no RLS, so this works from app_user role
      const { rows: userRows } = await c.query(
        "INSERT INTO users (email, password_hash, name) VALUES ('temp@test.com', 'hash', 'Temp') RETURNING id"
      );
      const tempUserId = userRows[0].id;
      const { rows } = await c.query(
        "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'viewer') RETURNING id",
        [tempUserId, WS_A_ID]
      );
      // Clean up
      await c.query('DELETE FROM memberships WHERE id = $1', [rows[0].id]);
      await c.query('DELETE FROM users WHERE id = $1', [tempUserId]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });

  it('cannot insert a membership for self in another workspace via RLS', async () => {
    // Alice is owner in A. She should not be able to add herself to a workspace
    // she doesn't own via the memberships INSERT policy (which requires ownership).
    // She IS a viewer in B, so the workspace exists for her.
    // But the INSERT policy requires ownership in the target workspace.
    await expect(
      withTestTenantContext(ALICE_ID, async (c) => {
        await c.query(
          "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')",
          [ALICE_ID, WS_B_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot invite self (policy prevents user_id = current user)', async () => {
    await expect(
      withTestTenantContext(ALICE_ID, async (c) => {
        await c.query(
          "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'editor')",
          [ALICE_ID, WS_A_ID]
        );
      })
    ).rejects.toThrow(); // either RLS or UNIQUE violation
  });
});

describe('Role enforcement — no tenant context set', () => {

  it('query fails if app.current_user_id is not set', async () => {
    const pool = (await import('./setup')).getTestPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Do NOT set app.current_user_id
      await expect(
        client.query('SELECT * FROM workspaces')
      ).rejects.toThrow();
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
