import { describe, it, expect, afterAll } from 'vitest';
import {
  closeTestPool, withTestTenantContext, getTestPool,
  ALICE_ID, BOB_ID, CHARLIE_ID,
  WS_A_ID, WS_B_ID,
  PROJ_Q4_ID, PROJ_TOOLS_ID, PROJ_RES_ID,
  NONEXISTENT_UUID,
} from './setup';

afterAll(async () => { await closeTestPool(); });

// -------------------------------------------------------------------
// These tests simulate every operation the UI can trigger, at the
// database layer.  They prove that authorization and tenant isolation
// hold regardless of what the client sends.
// -------------------------------------------------------------------

// ── WORKSPACE CRUD ──────────────────────────────────────────────────

describe('Workspace — list', () => {
  it('Bob sees only workspace A', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT id, name FROM workspaces ORDER BY name');
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Acme Corp');
  });

  it('Alice sees both workspaces', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query('SELECT name FROM workspaces ORDER BY name');
      return rows;
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { name: string }) => r.name)).toEqual(['Acme Corp', 'Globex Inc']);
  });
});

describe('Workspace — get by id', () => {
  it('member can get workspace', async () => {
    const ws = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT name FROM workspaces WHERE id=$1', [WS_A_ID]);
      return rows[0] ?? null;
    });
    expect(ws).not.toBeNull();
    expect(ws.name).toBe('Acme Corp');
  });

  it('non-member gets 0 rows for existing workspace', async () => {
    const ws = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT name FROM workspaces WHERE id=$1', [WS_B_ID]);
      return rows[0] ?? null;
    });
    expect(ws).toBeNull();
  });

  it('nonexistent workspace returns 0 rows (same shape)', async () => {
    const ws = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query('SELECT name FROM workspaces WHERE id=$1', [NONEXISTENT_UUID]);
      return rows[0] ?? null;
    });
    expect(ws).toBeNull();
  });
});

// ── PROJECT CRUD ────────────────────────────────────────────────────

describe('Project — list', () => {
  it('lists projects in authorized workspace', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT name FROM projects WHERE workspace_id=$1 ORDER BY name', [WS_A_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(2);
  });

  it('returns empty for unauthorized workspace', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT name FROM projects WHERE workspace_id=$1', [WS_B_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe('Project — create', () => {
  it('editor can create', async () => {
    const proj = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO projects (workspace_id, name) VALUES ($1, 'CRUD Test')
         RETURNING id, name`, [WS_A_ID]
      );
      await c.query('DELETE FROM projects WHERE id=$1', [rows[0].id]);
      return rows[0];
    });
    expect(proj.name).toBe('CRUD Test');
  });

  it('viewer cannot create', async () => {
    await expect(
      withTestTenantContext(CHARLIE_ID, async (c) => {
        await c.query(
          `INSERT INTO projects (workspace_id, name) VALUES ($1, 'Forbidden')`, [WS_A_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('editor cannot create in other workspace', async () => {
    await expect(
      withTestTenantContext(BOB_ID, async (c) => {
        await c.query(
          `INSERT INTO projects (workspace_id, name) VALUES ($1, 'Cross-tenant')`, [WS_B_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('Project — update', () => {
  it('owner can update', async () => {
    const count = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE projects SET name='Q4 Planning', updated_at=now()
         WHERE id=$1 AND workspace_id=$2`, [PROJ_Q4_ID, WS_A_ID]
      );
      return rowCount;
    });
    expect(count).toBe(1);
  });

  it('viewer cannot update', async () => {
    const count = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE projects SET name='Hacked' WHERE id=$1 AND workspace_id=$2`,
        [PROJ_Q4_ID, WS_A_ID]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });

  it('update on cross-tenant project returns 0 rows', async () => {
    const count = await withTestTenantContext(BOB_ID, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE projects SET name='Stolen' WHERE id=$1 AND workspace_id=$2`,
        [PROJ_RES_ID, WS_B_ID]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });

  it('update with wrong workspace_id in WHERE returns 0 (hierarchy check)', async () => {
    // Alice has access to both but Q4 is in WS_A
    const count = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE projects SET name='Misrouted' WHERE id=$1 AND workspace_id=$2`,
        [PROJ_Q4_ID, WS_B_ID]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });
});

describe('Project — delete', () => {
  it('editor can delete own workspace project', async () => {
    const deleted = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO projects (workspace_id, name) VALUES ($1, 'Temp') RETURNING id`, [WS_A_ID]
      );
      const { rowCount } = await c.query(
        'DELETE FROM projects WHERE id=$1 AND workspace_id=$2', [rows[0].id, WS_A_ID]
      );
      return rowCount;
    });
    expect(deleted).toBe(1);
  });

  it('viewer cannot delete', async () => {
    const count = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const { rowCount } = await c.query(
        'DELETE FROM projects WHERE id=$1 AND workspace_id=$2', [PROJ_Q4_ID, WS_A_ID]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });

  it('cross-tenant delete returns 0', async () => {
    const count = await withTestTenantContext(BOB_ID, async (c) => {
      const { rowCount } = await c.query(
        'DELETE FROM projects WHERE id=$1', [PROJ_RES_ID]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });
});

// ── NOTE CRUD ───────────────────────────────────────────────────────

describe('Note — list with hierarchy', () => {
  it('lists notes with valid hierarchy', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT n.title FROM notes n
         JOIN projects p ON n.project_id = p.id
         WHERE n.project_id=$1 AND p.workspace_id=$2`, [PROJ_Q4_ID, WS_A_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(3);
  });

  it('returns empty with wrong workspace in hierarchy', async () => {
    const rows = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT n.title FROM notes n
         JOIN projects p ON n.project_id = p.id
         WHERE n.project_id=$1 AND p.workspace_id=$2`, [PROJ_Q4_ID, WS_B_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('non-member cannot see notes', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT title FROM notes WHERE project_id=$1', [PROJ_RES_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe('Note — create with hierarchy validation', () => {
  it('editor creates note in own workspace project', async () => {
    const note = await withTestTenantContext(BOB_ID, async (c) => {
      // Verify project belongs to workspace first (as DAL does)
      const { rows: proj } = await c.query(
        'SELECT id FROM projects WHERE id=$1 AND workspace_id=$2', [PROJ_Q4_ID, WS_A_ID]
      );
      expect(proj).toHaveLength(1);

      const { rows } = await c.query(
        `INSERT INTO notes (project_id, title, content)
         VALUES ($1, 'DAL Note', 'content') RETURNING id, title`, [PROJ_Q4_ID]
      );
      await c.query('DELETE FROM notes WHERE id=$1', [rows[0].id]);
      return rows[0];
    });
    expect(note.title).toBe('DAL Note');
  });

  it('viewer cannot create note', async () => {
    await expect(
      withTestTenantContext(CHARLIE_ID, async (c) => {
        await c.query(
          `INSERT INTO notes (project_id, title, content)
           VALUES ($1, 'Forbidden', 'x')`, [PROJ_Q4_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot create note in cross-tenant project', async () => {
    await expect(
      withTestTenantContext(BOB_ID, async (c) => {
        await c.query(
          `INSERT INTO notes (project_id, title, content)
           VALUES ($1, 'Cross', 'x')`, [PROJ_RES_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('DAL rejects when project-workspace mismatch', async () => {
    // Simulates what the DAL does: check hierarchy before INSERT
    const result = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM projects WHERE id=$1 AND workspace_id=$2',
        [PROJ_RES_ID, WS_A_ID] // Research is in WS_B
      );
      return rows.length; // 0 → DAL would return null, not insert
    });
    expect(result).toBe(0);
  });
});

describe('Note — update', () => {
  it('editor can update note with full hierarchy', async () => {
    const updated = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows: notes } = await c.query(
        `SELECT n.id FROM notes n JOIN projects p ON n.project_id=p.id
         WHERE p.workspace_id=$1 LIMIT 1`, [WS_A_ID]
      );
      const { rowCount } = await c.query(
        `UPDATE notes SET title='Updated', updated_at=now()
         FROM projects p
         WHERE notes.id=$1 AND notes.project_id=p.id AND p.workspace_id=$2`,
        [notes[0].id, WS_A_ID]
      );
      // Restore
      await c.query(
        `UPDATE notes SET title='Budget Review' WHERE id=$1`, [notes[0].id]
      );
      return rowCount;
    });
    expect(updated).toBe(1);
  });

  it('viewer cannot update note', async () => {
    const count = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const { rows: notes } = await c.query(
        `SELECT n.id FROM notes n JOIN projects p ON n.project_id=p.id
         WHERE p.workspace_id=$1 LIMIT 1`, [WS_A_ID]
      );
      const { rowCount } = await c.query(
        `UPDATE notes SET title='Hacked' WHERE id=$1`, [notes[0].id]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });

  it('cross-tenant note update returns 0', async () => {
    const count = await withTestTenantContext(BOB_ID, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE notes SET title='Stolen' WHERE project_id=$1`, [PROJ_RES_ID]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });
});

describe('Note — delete', () => {
  it('editor can delete with hierarchy', async () => {
    const deleted = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO notes (project_id, title, content)
         VALUES ($1, 'ToDelete', 'x') RETURNING id`, [PROJ_Q4_ID]
      );
      const { rowCount } = await c.query(
        `DELETE FROM notes USING projects p
         WHERE notes.id=$1 AND notes.project_id=p.id AND p.workspace_id=$2`,
        [rows[0].id, WS_A_ID]
      );
      return rowCount;
    });
    expect(deleted).toBe(1);
  });

  it('viewer cannot delete note', async () => {
    const count = await withTestTenantContext(CHARLIE_ID, async (c) => {
      const { rows: notes } = await c.query(
        `SELECT n.id FROM notes n JOIN projects p ON n.project_id=p.id
         WHERE p.workspace_id=$1 LIMIT 1`, [WS_A_ID]
      );
      const { rowCount } = await c.query(
        'DELETE FROM notes WHERE id=$1', [notes[0].id]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });

  it('cross-tenant note delete returns 0', async () => {
    const count = await withTestTenantContext(BOB_ID, async (c) => {
      const { rowCount } = await c.query(
        'DELETE FROM notes WHERE project_id=$1', [PROJ_RES_ID]
      );
      return rowCount;
    });
    expect(count).toBe(0);
  });
});

// ── MEMBER OPERATIONS ───────────────────────────────────────────────

describe('Member — list', () => {
  it('member can list members in own workspace', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        `SELECT m.role, u.name FROM memberships m
         JOIN users u ON m.user_id=u.id
         WHERE m.workspace_id=$1 ORDER BY u.name`, [WS_A_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r: { name: string }) => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('non-member cannot list members of other workspace', async () => {
    const rows = await withTestTenantContext(BOB_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT role FROM memberships WHERE workspace_id=$1', [WS_B_ID]
      );
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe('Member — invite', () => {
  it('owner can invite (with ON CONFLICT DO NOTHING)', async () => {
    await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ('crud-invite@test.com', 'hash', 'CrudInvite') RETURNING id`
      );
      const uid = rows[0].id;

      const { rowCount } = await c.query(
        `INSERT INTO memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'viewer')
         ON CONFLICT (user_id, workspace_id) DO NOTHING`, [uid, WS_A_ID]
      );
      expect(rowCount).toBe(1);

      // Re-invite same user → no error, rowCount 0
      const { rowCount: rc2 } = await c.query(
        `INSERT INTO memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'editor')
         ON CONFLICT (user_id, workspace_id) DO NOTHING`, [uid, WS_A_ID]
      );
      expect(rc2).toBe(0);

      await c.query('DELETE FROM memberships WHERE user_id=$1', [uid]);
      await c.query('DELETE FROM users WHERE id=$1', [uid]);
    });
  });

  it('editor cannot invite', async () => {
    await expect(
      withTestTenantContext(BOB_ID, async (c) => {
        await c.query(
          `INSERT INTO memberships (user_id, workspace_id, role)
           VALUES ($1, $2, 'viewer')`, [NONEXISTENT_UUID, WS_A_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner cannot self-invite into workspace they do not own', async () => {
    // Alice is viewer in WS_B, tries to add herself as owner
    await expect(
      withTestTenantContext(ALICE_ID, async (c) => {
        await c.query(
          `INSERT INTO memberships (user_id, workspace_id, role)
           VALUES ($1, $2, 'owner')`, [ALICE_ID, WS_B_ID]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });
});

// ── CASCADE DELETE ──────────────────────────────────────────────────

describe('Cascade delete', () => {
  it('deleting a project cascades to its notes', async () => {
    const result = await withTestTenantContext(ALICE_ID, async (c) => {
      // Create project + notes
      const { rows: proj } = await c.query(
        `INSERT INTO projects (workspace_id, name) VALUES ($1, 'Cascade Test')
         RETURNING id`, [WS_A_ID]
      );
      const pid = proj[0].id;
      await c.query(
        `INSERT INTO notes (project_id, title, content) VALUES ($1, 'N1', 'c1'), ($1, 'N2', 'c2')`,
        [pid]
      );
      const { rows: before } = await c.query(
        'SELECT count(*)::int AS cnt FROM notes WHERE project_id=$1', [pid]
      );
      expect(before[0].cnt).toBe(2);

      // Delete project
      await c.query('DELETE FROM projects WHERE id=$1 AND workspace_id=$2', [pid, WS_A_ID]);

      // Notes should be gone
      const { rows: after } = await c.query(
        'SELECT count(*)::int AS cnt FROM notes WHERE project_id=$1', [pid]
      );
      return after[0].cnt;
    });
    expect(result).toBe(0);
  });
});

// ── EDGE CASES ──────────────────────────────────────────────────────

describe('Edge cases — URL and body tampering', () => {
  it('wrong workspace ID in URL → project not found (even if it exists)', async () => {
    // Alice can access PROJ_Q4_ID via WS_A_ID, but not via WS_B_ID
    const project = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows } = await c.query(
        'SELECT id FROM projects WHERE id=$1 AND workspace_id=$2',
        [PROJ_Q4_ID, WS_B_ID]
      );
      return rows[0] ?? null;
    });
    expect(project).toBeNull();
  });

  it('wrong project ID in URL → note not found (even if it exists)', async () => {
    // Get a real note from Q4 Planning
    const note = await withTestTenantContext(ALICE_ID, async (c) => {
      const { rows: notes } = await c.query(
        'SELECT id FROM notes WHERE project_id=$1 LIMIT 1', [PROJ_Q4_ID]
      );
      const noteId = notes[0].id;

      // Try to access it through the wrong project
      const { rows } = await c.query(
        `SELECT n.id FROM notes n
         JOIN projects p ON n.project_id=p.id
         WHERE n.id=$1 AND n.project_id=$2 AND p.workspace_id=$3`,
        [noteId, PROJ_TOOLS_ID, WS_A_ID] // wrong project
      );
      return rows[0] ?? null;
    });
    expect(note).toBeNull();
  });

  it('fabricated UUID always returns empty, never errors', async () => {
    const results = await withTestTenantContext(BOB_ID, async (c) => {
      const ws = await c.query('SELECT * FROM workspaces WHERE id=$1', [NONEXISTENT_UUID]);
      const proj = await c.query('SELECT * FROM projects WHERE id=$1', [NONEXISTENT_UUID]);
      const note = await c.query('SELECT * FROM notes WHERE id=$1', [NONEXISTENT_UUID]);
      const mem = await c.query('SELECT * FROM memberships WHERE workspace_id=$1', [NONEXISTENT_UUID]);
      return {
        ws: ws.rows.length,
        proj: proj.rows.length,
        note: note.rows.length,
        mem: mem.rows.length,
      };
    });
    expect(results).toEqual({ ws: 0, proj: 0, note: 0, mem: 0 });
  });
});
