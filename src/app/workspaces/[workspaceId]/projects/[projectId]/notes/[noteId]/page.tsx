import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { withTenantContext } from '@/lib/db';
import { getMembership } from '@/lib/dal/members';
import { getNote } from '@/lib/dal/notes';
import { NoteEditor } from './note-editor';

export default async function NotePage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; noteId: string }>;
}) {
  const { workspaceId, projectId, noteId } = await params;
  const user = await requireSession();

  const result = await withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, workspaceId);
    if (!membership) return null;

    const note = await getNote(client, workspaceId, projectId, noteId);
    if (!note) return null;

    return { note, role: membership.role };
  });

  if (!result) notFound();
  const { note, role } = result;
  const canWrite = role === 'owner' || role === 'editor';

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/workspaces/${workspaceId}/projects/${projectId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Notes
        </Link>
      </div>

      <NoteEditor
        workspaceId={workspaceId}
        projectId={projectId}
        note={note}
        canWrite={canWrite}
      />
    </div>
  );
}
