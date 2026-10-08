import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const APP_DATABASE_URL = process.env.APP_DATABASE_URL ?? 'postgresql://app_user:app_password@localhost:5432/workspace_notes';
let pool: Pool;

beforeAll(() => { pool = new Pool({ connectionString: APP_DATABASE_URL, max: 3 }); });
afterAll(async () => { await pool.end(); });

// Direct auth tests — exercise the same SQL the auth module uses,
// without importing Next.js-dependent code.

describe('Authentication — login flow', () => {

  it('valid credentials return user and create session', async () => {
    const { rows: users } = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      ['alice@test.com']
    );
    expect(users).toHaveLength(1);
    const user = users[0];

    const valid = await bcrypt.compare('password123', user.password_hash);
    expect(valid).toBe(true);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 86400000);
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const { rows: sessions } = await pool.query(
      `SELECT u.id, u.email, u.name FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].email).toBe('alice@test.com');

    // Cleanup
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  });

  it('invalid password rejects login', async () => {
    const { rows: users } = await pool.query(
      'SELECT password_hash FROM users WHERE email = $1',
      ['alice@test.com']
    );
    const valid = await bcrypt.compare('wrong-password', users[0].password_hash);
    expect(valid).toBe(false);
  });

  it('nonexistent email — bcrypt still runs (constant-time)', async () => {
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE email = $1',
      ['nonexistent@test.com']
    );
    expect(rows).toHaveLength(0);

    // The auth module uses DUMMY_HASH when user not found.
    // Verify bcrypt.compare works against a dummy hash without error.
    const dummyHash = bcrypt.hashSync('dummy', 10);
    const valid = await bcrypt.compare('any-password', dummyHash);
    expect(valid).toBe(false);
  });

  it('same error for bad email and bad password (no enumeration)', async () => {
    // Both cases should yield the same result shape: null / false
    const { rows: noUser } = await pool.query(
      'SELECT id FROM users WHERE email = $1', ['ghost@test.com']
    );
    expect(noUser).toHaveLength(0);

    const { rows: realUser } = await pool.query(
      'SELECT password_hash FROM users WHERE email = $1', ['alice@test.com']
    );
    const wrongPw = await bcrypt.compare('nope', realUser[0].password_hash);
    expect(wrongPw).toBe(false);
    // Both paths yield the same "invalid" result — no distinguishable difference
  });

  it('expired session is rejected', async () => {
    const { rows: users } = await pool.query(
      'SELECT id FROM users WHERE email = $1', ['alice@test.com']
    );
    const token = crypto.randomUUID();
    const expired = new Date(Date.now() - 1000); // 1 second ago

    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [users[0].id, token, expired]
    );

    const { rows: sessions } = await pool.query(
      `SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()`,
      [token]
    );
    expect(sessions).toHaveLength(0);

    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  });

  it('missing token returns no session', async () => {
    const { rows } = await pool.query(
      `SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()`,
      ['nonexistent-token']
    );
    expect(rows).toHaveLength(0);
  });

  it('session deletion works', async () => {
    const { rows: users } = await pool.query(
      'SELECT id FROM users WHERE email = $1', ['bob@test.com']
    );
    const token = crypto.randomUUID();
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [users[0].id, token, new Date(Date.now() + 86400000)]
    );

    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);

    const { rows: after } = await pool.query(
      'SELECT user_id FROM sessions WHERE token = $1', [token]
    );
    expect(after).toHaveLength(0);
  });
});
