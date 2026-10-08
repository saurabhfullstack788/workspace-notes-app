import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { withTenantContext } from '@/lib/db';
import { getMembership } from '@/lib/dal/members';
import { listProjects } from '@/lib/dal/projects';
import { CreateProjectForm } from './create-project-form';

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await requireSession();

  const result = await withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, workspaceId);
    if (!membership) return null;

    const projects = await listProjects(client, workspaceId);
    return { projects, role: membership.role };
  });

  if (!result) notFound();
  const { projects, role } = result;
  const canWrite = role === 'owner' || role === 'editor';

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/workspaces"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to workspaces
        </Link>
      </div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Projects</h2>
      </div>

      {canWrite && <CreateProjectForm workspaceId={workspaceId} />}

      {projects.length === 0 ? (
        <p className="text-gray-500 mt-4">No projects yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/workspaces/${workspaceId}/projects/${project.id}`}
                className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-medium">{project.name}</span>
                <span className="text-xs text-gray-400">
                  {project.summary ? 'Summarized' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
