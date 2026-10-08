import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { withTenantContext } from '@/lib/db';
import { getMembership } from '@/lib/dal/members';
import { getProject } from '@/lib/dal/projects';
import { listNotes } from '@/lib/dal/notes';
import { CreateNoteForm } from './create-note-form';
import { ProjectActions } from './project-actions';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const user = await requireSession();

  const result = await withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, workspaceId);
    if (!membership) return null;

    const project = await getProject(client, workspaceId, projectId);
    if (!project) return null;

    const notes = await listNotes(client, workspaceId, projectId);
    return { project, notes, role: membership.role };
  });

  if (!result) notFound();
  const { project, notes, role } = result;
  const canWrite = role === 'owner' || role === 'editor';

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/workspaces/${workspaceId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Projects
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{project.name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <ProjectActions
          workspaceId={workspaceId}
          projectId={projectId}
          canWrite={canWrite}
        />
      </div>

      {project.summary && (
        <div className="mb-6 rounded border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-1">Summary</h3>
          <p className="text-sm text-blue-700">
            {(project.summary as { summary?: string }).summary}
          </p>
          {Array.isArray((project.summary as { keyTopics?: string[] }).keyTopics) &&
            (project.summary as { keyTopics: string[] }).keyTopics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(project.summary as { keyTopics: string[] }).keyTopics.map(
                  (topic, i) => (
                    <span
                      key={i}
                      className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                    >
                      {topic}
                    </span>
                  )
                )}
              </div>
            )}
        </div>
      )}

      {canWrite && (
        <CreateNoteForm workspaceId={workspaceId} projectId={projectId} />
      )}

      {notes.length === 0 ? (
        <p className="text-gray-500 mt-4">No notes yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/workspaces/${workspaceId}/projects/${projectId}/notes/${note.id}`}
                className="block rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-medium">{note.title}</span>
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                  {note.content}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
