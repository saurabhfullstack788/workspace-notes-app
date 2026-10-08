import { describe, it, expect, afterAll } from 'vitest';
import {
  closeTestPool, withTestTenantContext,
  BOB_ID, ALICE_ID, CHARLIE_ID,
  WS_A_ID, WS_B_ID,
  PROJ_Q4_ID, PROJ_TOOLS_ID, PROJ_RES_ID,
  NONEXISTENT_UUID,
} from './setup';

afterAll(async () => { await closeTestPool(); });

describe('Tenant isolation — Bob (workspace A only) vs workspace B', () => {

  // ── SELECT ────────────────────────────────────────────────

  it('cannot see workspace B', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT * FROM workspaces WHERE id = $1', [WS_B_ID]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('cannot see memberships in workspace B', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT * FROM memberships WHERE workspace_id = $1', [WS_B_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('cannot see projects in workspace B', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT * FROM projects WHERE workspace_id = $1', [WS_B_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('cannot see notes in workspace B projects', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT * FROM notes WHERE project_id = $1', [PROJ_RES_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  // ── INSERT ────────────────────────────────────────────────

  it('cannot insert a project into workspace B', async () => {
    await expect(
      withTestTenantContext(BOB_ID, async (c) => {
        await c.query(
          "INSERT INTO projects (workspace_id, name) VALUES ($1, 'Evil Project')",
          [WS_B_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot insert a note into a workspace B project', async () => {
    await expect(
      withTestTenantContext(BOB_ID, async (c) => {
        await c.query(
          "INSERT INTO notes (project_id, title, content) VALUES ($1, 'Evil', 'data')",
          [PROJ_RES_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot insert a membership into workspace B', async () => {
    await expect(
      withTestTenantContext(BOB_ID, async (c) => {
        await c.query(
          "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'editor')",
          [BOB_ID, WS_B_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  // ── UPDATE ────────────────────────────────────────────────

  it('cannot update a project in workspace B', async () => {
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      const r = await c.query(
        "UPDATE projects SET name = 'Hacked' WHERE id = $1", [PROJ_RES_ID]
      );
      return r.rowCount;
    });
    expect(result).toBe(0);
  });

  it('cannot update notes in workspace B', async () => {
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      const r = await c.query(
        "UPDATE notes SET content = 'Hacked' WHERE project_id = $1", [PROJ_RES_ID]
      );
      return r.rowCount;
    });
    expect(result).toBe(0);
  });

  // ── DELETE ────────────────────────────────────────────────

  it('cannot delete a project in workspace B', async () => {
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      const r = await c.query('DELETE FROM projects WHERE id = $1', [PROJ_RES_ID]);
      return r.rowCount;
    });
    expect(result).toBe(0);
  });

  it('cannot delete notes in workspace B', async () => {
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      const r = await c.query('DELETE FROM notes WHERE project_id = $1', [PROJ_RES_ID]);
      return r.rowCount;
    });
    expect(result).toBe(0);
  });
});

describe('Tenant isolation — no information leakage', () => {

  it('querying a nonexistent workspace returns 0 rows (same as unauthorized)', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT * FROM workspaces WHERE id = $1', [NONEXISTENT_UUID]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('querying a nonexistent project returns 0 rows', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT * FROM projects WHERE id = $1', [NONEXISTENT_UUID]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('workspace B project through workspace A URL returns 0 rows (hierarchy validation)', async () => {
    // Bob is in workspace A. Try accessing workspace B's project with workspace A's ID.
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT * FROM projects WHERE id = $1 AND workspace_id = $2',
        [PROJ_RES_ID, WS_A_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe('Tenant isolation — immutability triggers', () => {

  it('cannot move a project to a different workspace', async () => {
    await expect(
      withTestTenantContext(ALICE_ID, async (c) => {
        await c.query(
          'UPDATE projects SET workspace_id = $1 WHERE id = $2',
          [WS_B_ID, PROJ_Q4_ID]
        );
      })
    ).rejects.toThrow(/Cannot change workspace_id/);
  });

  it('cannot move a note to a different project', async () => {
    await expect(
      withTestTenantContext(ALICE_ID, async (c) => {
        // Get a note from workspace A
        const { rows } = await c.query(
          'SELECT id FROM notes WHERE project_id = $1 LIMIT 1', [PROJ_Q4_ID]
        );
        expect(rows.length).toBeGreaterThan(0);
        await c.query(
          'UPDATE notes SET project_id = $1 WHERE id = $2',
          [PROJ_TOOLS_ID, rows[0].id]
        );
      })
    ).rejects.toThrow(/Cannot change project_id/);
  });
});

describe('Tenant isolation — cross-workspace users (Alice in both)', () => {

  it('Alice can see both workspaces', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query('SELECT id FROM workspaces ORDER BY name');
      return rows;
    });
    expect(rows).toHaveLength(2);
  });

  it('Alice can see projects only in her workspaces', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query('SELECT id, workspace_id FROM projects');
      return rows;
    });
    expect(rows).toHaveLength(3);
  });

  it('Alice (viewer in B) cannot create project in workspace B', async () => {
    await expect(
      withTestTenantContext(ALICE_ID, async (c) => {
        await c.query(
          "INSERT INTO projects (workspace_id, name) VALUES ($1, 'Sneaky Project')",
          [WS_B_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('Alice (viewer in B) cannot update project in workspace B', async () => {
    const result = await withTestTenantContext(ALICE_ID, async (c) => {
      const r = await c.query(
        "UPDATE projects SET name = 'Hacked' WHERE id = $1", [PROJ_RES_ID]
      );
      return r.rowCount;
    });
    expect(result).toBe(0);
  });

  it('Alice (owner in A) can create project in workspace A', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        "INSERT INTO projects (workspace_id, name) VALUES ($1, 'Test Project') RETURNING id",
        [WS_A_ID]
      );
      // Clean up
      await c.query('DELETE FROM projects WHERE id = $1', [rows[0].id]);
      return rows;
    });
    expect(rows).toHaveLength(1);
  });
});
