import { Pool, PoolClient } from 'pg';

const APP_DATABASE_URL = process.env.APP_DATABASE_URL ?? 'postgresql://app_user:app_password@localhost:5432/workspace_notes';

let pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: APP_DATABASE_URL, max: 5 });
  }
  return pool;
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function withTestTenantContext<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getTestPool();
  const client = await p.connect();
  let destroyOnRelease = true;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query('ROLLBACK');
    destroyOnRelease = false;
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release(destroyOnRelease);
  }
}

// Seed IDs — must match 004_seed.sql
export const ALICE_ID   = 'a1111111-1111-1111-1111-111111111111';
export const BOB_ID     = 'b2222222-2222-2222-2222-222222222222';
export const CHARLIE_ID = 'c3333333-3333-3333-3333-333333333333';

export const WS_A_ID = 'aaaa0000-0000-0000-0000-000000000001';
export const WS_B_ID = 'bbbb0000-0000-0000-0000-000000000002';

export const PROJ_Q4_ID    = 'dd100000-0000-0000-0000-000000000001';
export const PROJ_TOOLS_ID = 'dd200000-0000-0000-0000-000000000002';
export const PROJ_RES_ID   = 'dd300000-0000-0000-0000-000000000003';

export const NONEXISTENT_UUID = 'deadbeef-dead-dead-dead-deaddeadbeef';
