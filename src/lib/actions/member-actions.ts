'use server';

import { z } from 'zod';
import { requireSession } from '../auth';
import { withTenantContext } from '../db';
import { getMembership, getMembers, addMember, Membership } from '../dal/members';

const UUIDSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');
const RoleSchema = z.enum(['owner', 'editor', 'viewer']);

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };

function notFound(): ActionResult<never> {
  return { success: false, error: 'Not found', status: 404 };
}

function forbidden(): ActionResult<never> {
  return { success: false, error: 'Forbidden', status: 403 };
}

export async function listMembersAction(
  workspaceId: string
): Promise<ActionResult<Membership[]>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  if (!wsId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();

    const members = await getMembers(client, wsId.data);
    return { success: true, data: members };
  });
}

export async function inviteMemberAction(
  workspaceId: string,
  formData: FormData
): Promise<ActionResult<void>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  if (!wsId.success) return notFound();

  const email = z.string().email().safeParse(formData.get('email'));
  const role = RoleSchema.safeParse(formData.get('role'));
  if (!email.success || !role.success) {
    return { success: false, error: 'Valid email and role required', status: 400 };
  }

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role !== 'owner') return forbidden();

    // Look up target user inside tenant context to keep all queries on one connection.
    // The users table has no RLS, so this works within the transaction.
    // Same response whether found or not (no user enumeration).
    const { rows } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.data]
    );
    const targetUser = rows[0];
    if (!targetUser) {
      // Pretend success to avoid leaking whether the user exists
      return { success: true, data: undefined };
    }

    await addMember(client, wsId.data, targetUser.id, role.data);
    return { success: true, data: undefined };
  });
}
