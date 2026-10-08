import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { withTenantContext } from '@/lib/db';
import { getWorkspace, listWorkspaces } from '@/lib/dal/workspaces';
import { getMembership } from '@/lib/dal/members';
import { WorkspaceSwitcher } from './workspace-switcher';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!UUID_RE.test(workspaceId)) notFound();

  const user = await requireSession();

  const { workspace, workspaces, role } = await withTenantContext(
    user.id,
    async (client) => {
      const workspace = await getWorkspace(client, workspaceId);
      if (!workspace) return { workspace: null, workspaces: [], role: null };

      const membership = await getMembership(client, workspaceId);
      const workspaces = await listWorkspaces(client);
      return { workspace, workspaces, role: membership?.role ?? null };
    }
  );

  if (!workspace || !role) notFound();

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/workspaces" className="text-sm text-gray-500 hover:text-gray-700">
              All workspaces
            </Link>
            <span className="text-gray-300">/</span>
            <WorkspaceSwitcher
              workspaces={workspaces.map((ws) => ({ id: ws.id, name: ws.name }))}
              currentId={workspaceId}
            />
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {role}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Link
              href={`/workspaces/${workspaceId}`}
              className="text-gray-600 hover:text-gray-900"
            >
              Projects
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/members`}
              className="text-gray-600 hover:text-gray-900"
            >
              Members
            </Link>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
