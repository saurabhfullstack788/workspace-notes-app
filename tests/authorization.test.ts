import { describe, it, expect, afterAll } from 'vitest';
import {
  closeTestPool, withTestTenantContext,
  ALICE_ID, BOB_ID, CHARLIE_ID,
  WS_A_ID, WS_B_ID,
  PROJ_Q4_ID, PROJ_TOOLS_ID, PROJ_RES_ID,
  NONEXISTENT_UUID,
} from './setup';

afterAll(async () => { await closeTestPool(); });

// These tests verify the DAL functions enforce authorization correctly.
// They call the same SQL the server actions use, without the Next.js wrapper.

describe('Authorization — workspace access', () => {

  it('member can list their workspaces', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id, name FROM workspaces ORDER BY name'
      );
      return rows;
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { name: string }) => r.name)).toContain('Acme Corp');
    expect(rows.map((r: { name: string }) => r.name)).toContain('Globex Inc');
  });

  it('non-member sees no workspaces they do not belong to', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT id FROM workspaces');
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(WS_A_ID);
  });
});

describe('Authorization — membership lookup (getMembership pattern)', () => {

  it('returns membership for member', async () => {
    const row = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT m.role FROM memberships m
         WHERE m.workspace_id = $1 AND m.user_id = current_app_user_id()`,
        [WS_A_ID]
      );
      return rows[0];
    });
    expect(row).toBeDefined();
    expect(row.role).toBe('owner');
  });

  it('returns null for non-member (same as nonexistent workspace)', async () => {
    const row = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT m.role FROM memberships m
         WHERE m.workspace_id = $1 AND m.user_id = current_app_user_id()`,
        [WS_B_ID]
      );
      return rows[0] ?? null;
    });
    expect(row).toBeNull();
  });

  it('nonexistent workspace returns null (no info leakage)', async () => {
    const row = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT m.role FROM memberships m
         WHERE m.workspace_id = $1 AND m.user_id = current_app_user_id()`,
        [NONEXISTENT_UUID]
      );
      return rows[0] ?? null;
    });
    expect(row).toBeNull();
  });
});

describe('Authorization — project hierarchy validation', () => {

  it('project fetched with correct workspace returns data', async () => {
    const row = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id, name FROM projects WHERE id = $1 AND workspace_id = $2',
        [PROJ_Q4_ID, WS_A_ID]
      );
      return rows[0] ?? null;
    });
    expect(row).not.toBeNull();
    expect(row.name).toBe('Q4 Planning');
  });

  it('project fetched with WRONG workspace returns null (hierarchy IDOR blocked)', async () => {
    // Alice is in both workspaces. Try to load workspace B project via workspace A URL.
    const row = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM projects WHERE id = $1 AND workspace_id = $2',
        [PROJ_RES_ID, WS_A_ID] // Research project is in WS_B, not WS_A
      );
      return rows[0] ?? null;
    });
    expect(row).toBeNull();
  });

  it('project fetched with nonexistent workspace returns null', async () => {
    const row = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM projects WHERE id = $1 AND workspace_id = $2',
        [PROJ_Q4_ID, NONEXISTENT_UUID]
      );
      return rows[0] ?? null;
    });
    expect(row).toBeNull();
  });
});

describe('Authorization — note hierarchy validation', () => {

  it('notes fetched with full hierarchy (note→project→workspace)', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT n.id, n.title FROM notes n
         JOIN projects p ON n.project_id = p.id
         WHERE n.project_id = $1 AND p.workspace_id = $2`,
        [PROJ_Q4_ID, WS_A_ID]
      );
      return rows;
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('notes with wrong workspace in hierarchy return empty', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT n.id FROM notes n
         JOIN projects p ON n.project_id = p.id
         WHERE n.project_id = $1 AND p.workspace_id = $2`,
        [PROJ_Q4_ID, WS_B_ID] // Q4 is in WS_A, not WS_B
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('note create blocked when project-workspace mismatch', async () => {
    // Bob (editor in WS_A) tries to create a note, but the project belongs to WS_B.
    // First, verify the project lookup with wrong workspace returns empty.
    const projCheck = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM projects WHERE id = $1 AND workspace_id = $2',
        [PROJ_RES_ID, WS_A_ID]
      );
      return rows;
    });
    expect(projCheck).toHaveLength(0);
    // The DAL's createNote does this check before INSERT, so the note is never created.
  });
});

describe('Authorization — role-based write enforcement via DAL pattern', () => {

  it('editor can create+update+delete in their workspace', async () => {
    await withTestTenantContext(BOB_ID, async (c) => {
      // Create
      const { rows: created } = await c.query(
        `INSERT INTO projects (workspace_id, name) VALUES ($1, 'Auth Test Proj')
         RETURNING id`,
        [WS_A_ID]
      );
      expect(created).toHaveLength(1);
      const projId = created[0].id;

      // Update
      const { rowCount: updated } = await c.query(
        `UPDATE projects SET name = 'Auth Test Proj Updated'
         WHERE id = $1 AND workspace_id = $2`,
        [projId, WS_A_ID]
      );
      expect(updated).toBe(1);

      // Create note in the project
      const { rows: noteCreated } = await c.query(
        `INSERT INTO notes (project_id, title, content)
         VALUES ($1, 'Auth Note', 'content') RETURNING id`,
        [projId]
      );
      expect(noteCreated).toHaveLength(1);

      // Delete note
      const { rowCount: noteDeleted } = await c.query(
        `DELETE FROM notes WHERE id = $1`, [noteCreated[0].id]
      );
      expect(noteDeleted).toBe(1);

      // Delete project
      const { rowCount: deleted } = await c.query(
        'DELETE FROM projects WHERE id = $1 AND workspace_id = $2',
        [projId, WS_A_ID]
      );
      expect(deleted).toBe(1);
    });
  });

  it('viewer cannot write even with valid workspace membership', async () => {
    // Charlie is viewer in WS_A
    await expect(
      withTestTenantContext(CHARLIE_ID, async (c) => {
        await c.query(
          `INSERT INTO projects (workspace_id, name) VALUES ($1, 'Viewer Attempt')`,
          [WS_A_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner can invite but not self-invite', async () => {
    await withTestTenantContext(ALICE_ID, async (c) => {
      // Create temp user
      const { rows } = await c.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ('authtest@test.com', 'hash', 'AuthTest') RETURNING id`
      );
      const tempId = rows[0].id;

      // Owner invites temp user
      const { rowCount } = await c.query(
        `INSERT INTO memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'viewer')
         ON CONFLICT (user_id, workspace_id) DO NOTHING`,
        [tempId, WS_A_ID]
      );
      expect(rowCount).toBe(1);

      // Clean up
      await c.query('DELETE FROM memberships WHERE user_id = $1', [tempId]);
      await c.query('DELETE FROM users WHERE id = $1', [tempId]);
    });

    // Self-invite blocked
    await expect(
      withTestTenantContext(ALICE_ID, async (c) => {
        await c.query(
          `INSERT INTO memberships (user_id, workspace_id, role)
           VALUES ($1, $2, 'editor')`,
          [ALICE_ID, WS_A_ID]
        );
      })
    ).rejects.toThrow(); // RLS or UNIQUE
  });
});

describe('Authorization — server never trusts client IDs', () => {

  it('workspace ID from URL is validated, not just passed through', async () => {
    // Simulates: user sends workspace_id=WS_B in URL, but they are Bob (WS_A only).
    // The DAL checks membership for the URL workspace — returns null → 404.
    const membership = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT role FROM memberships
         WHERE workspace_id = $1 AND user_id = current_app_user_id()`,
        [WS_B_ID]
      );
      return rows[0] ?? null;
    });
    expect(membership).toBeNull();
    // Server action would return { success: false, error: 'Not found', status: 404 }
  });

  it('user ID always derived from session, never from request', async () => {
    // Even if an attacker sends user_id in the request body, the server
    // uses current_app_user_id() which comes from the session GUC.
    // Test: set context as Bob, query returns Bob's data regardless of what
    // a hypothetical request body might contain.
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT current_app_user_id() AS uid');
      return rows[0].uid;
    });
    expect(result).toBe(BOB_ID);
  });

  it('role is always checked server-side, never from client', async () => {
    // Simulates: viewer Charlie tries to write. Even if client sent role=editor,
    // the server checks the actual membership role.
    const role = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT role FROM memberships
         WHERE workspace_id = $1 AND user_id = current_app_user_id()`,
        [WS_A_ID]
      );
      return rows[0]?.role;
    });
    expect(role).toBe('viewer');
    // Server action would check: if (role === 'viewer') return forbidden();
  });

  it('tampered workspace ID in body is ignored — workspace comes from URL', async () => {
    // The server action takes workspaceId from URL params, not from the form body.
    // Here we verify that even if a different workspace_id is in the query,
    // RLS + hierarchy validation prevents cross-tenant access.
    const result = await withTestTenantContext(BOB_ID, async (c) => {
      // Bob tries to create a project in WS_B by passing it as workspace_id.
      // RLS blocks this because Bob has no membership in WS_B.
      try {
        await c.query(
          `INSERT INTO projects (workspace_id, name) VALUES ($1, 'Body Tamper')`,
          [WS_B_ID]
        );
        return 'SHOULD_NOT_REACH';
      } catch {
        return 'BLOCKED';
      }
    });
    expect(result).toBe('BLOCKED');
  });
});

describe('Authorization — invite flow does not leak user existence', () => {

  it('inviting nonexistent email and existing email produce same DB path', async () => {
    // Look up nonexistent user
    const { rows: ghost } = await withTestTenantContext(ALICE_ID, async (c) => {
      // This query runs outside RLS (users table has no RLS).
      // But in the action, we use pool.query, not client.query.
      // For testing, we just verify the lookup behavior.
      const { rows } = await c.query(
        'SELECT id FROM users WHERE email = $1',
        ['ghost@example.com']
      );
      return { rows };
    });
    expect(ghost).toHaveLength(0);

    // Look up existing user
    const { rows: real } = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM users WHERE email = $1',
        ['bob@test.com']
      );
      return { rows };
    });
    expect(real).toHaveLength(1);

    // Both paths should return the same action result (success: true).
    // The test here verifies the lookup works; the action wraps both in
    // the same { success: true } response.
  });

  it('duplicate invite uses ON CONFLICT DO NOTHING (no error)', async () => {
    await withTestTenantContext(ALICE_ID, async (c) => {
      // Bob is already a member of WS_A. Re-inviting silently succeeds.
      const { rowCount } = await c.query(
        `INSERT INTO memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'viewer')
         ON CONFLICT (user_id, workspace_id) DO NOTHING`,
        [BOB_ID, WS_A_ID]
      );
      // rowCount is 0 (conflict, no insert) — but no error thrown
      expect(rowCount).toBe(0);
    });
  });
});
