import { Pool, PoolClient } from 'pg';

const APP_DATABASE_URL = process.env.APP_DATABASE_URL ?? 'postgresql://app_user:app_password@localhost:5432/workspace_notes';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: APP_DATABASE_URL, max: 10 });
  }
  return pool;
}

export async function verifyRuntimeRole(): Promise<void> {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT current_user AS role_name,
           (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_super,
           (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses_rls
  `);
  const { is_super, bypasses_rls } = rows[0];
  if (is_super || bypasses_rls) {
    throw new Error(
      'FATAL: Application must not connect as superuser or BYPASSRLS role. ' +
      'Connect as app_user instead.'
    );
  }
}

export async function withTenantContext<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  let destroyOnRelease = true;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    destroyOnRelease = false;
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release(destroyOnRelease);
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
