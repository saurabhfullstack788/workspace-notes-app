import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { withTenantContext } from '@/lib/db';
import { getMembership, getMembers } from '@/lib/dal/members';
import { InviteForm } from './invite-form';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSession();

  const result = await withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, workspaceId);
    if (!membership) return null;

    const members = await getMembers(client, workspaceId);
    return { members, role: membership.role };
  });

  if (!result) notFound();
  const { members, role } = result;
  const isOwner = role === 'owner';

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Members</h2>

      {isOwner && <InviteForm workspaceId={workspaceId} />}

      <ul className="mt-4 space-y-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded border border-gray-200 px-4 py-3"
          >
            <div>
              <span className="font-medium">{m.userName}</span>
              <span className="ml-2 text-sm text-gray-500">{m.userEmail}</span>
            </div>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {m.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
