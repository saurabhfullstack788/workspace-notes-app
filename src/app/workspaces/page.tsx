import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { withTenantContext } from '@/lib/db';
import { listWorkspaces } from '@/lib/dal/workspaces';
import { logoutAction } from '@/lib/actions/auth-actions';

export default async function WorkspacesPage() {
  const user = await requireSession();

  const workspaces = await withTenantContext(user.id, (client) =>
    listWorkspaces(client)
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <p className="text-sm text-gray-500">Signed in as {user.name} ({user.email})</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            Sign out
          </button>
        </form>
      </div>

      {workspaces.length === 0 ? (
        <p className="text-gray-500">No workspaces found.</p>
      ) : (
        <ul className="space-y-2">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <Link
                href={`/workspaces/${ws.id}`}
                className="block rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-medium">{ws.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
