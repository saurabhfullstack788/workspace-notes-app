import { cookies } from 'next/headers';
import { connection } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { getPool } from './db';

const SESSION_COOKIE = 'session_token';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

const DUMMY_HASH = bcrypt.hashSync('dummy-constant-time-comparison', 10);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function login(
  email: string,
  password: string
): Promise<{ user: SessionUser; token: string } | null> {
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT id, email, name, password_hash FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];

  // Always run bcrypt.compare to prevent timing side-channel
  const hash = user?.password_hash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) return null;

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  // Clean up expired sessions for this user (prevents unbounded accumulation)
  await pool.query(
    'DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()',
    [user.id]
  );

  await pool.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expiresAt]
  );

  return {
    user: { id: user.id, email: user.email, name: user.name },
    token,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSessionFromToken(token: string): Promise<SessionUser | null> {
  if (!UUID_RE.test(token)) return null;

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  return rows[0] ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function getSession(): Promise<SessionUser | null> {
  await connection();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionFromToken(token);
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    redirect('/login');
    throw new Error('Redirect');
  }
  return user;
}

export function setSessionCookie(token: string): {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

export function clearSessionCookie(): {
  name: string;
  value: string;
  maxAge: number;
} {
  return {
    name: SESSION_COOKIE,
    value: '',
    maxAge: 0,
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
