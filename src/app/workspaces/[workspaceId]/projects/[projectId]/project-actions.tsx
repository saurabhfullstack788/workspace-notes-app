'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteProjectAction,
  updateProjectAction,
  summarizeProjectAction,
} from '@/lib/actions/project-actions';

export function ProjectActions({
  workspaceId,
  projectId,
  canWrite,
}: {
  workspaceId: string;
  projectId: string;
  canWrite: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryMsg, setSummaryMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!canWrite) return null;

  function handleDelete() {
    if (!confirm('Delete this project and all its notes?')) return;
    startTransition(async () => {
      const result = await deleteProjectAction(workspaceId, projectId);
      if (result.success) {
        router.push(`/workspaces/${workspaceId}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleRename(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateProjectAction(workspaceId, projectId, formData);
      if (result.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleSummarize() {
    setError(null);
    setSummaryMsg(null);
    startTransition(async () => {
      const result = await summarizeProjectAction(workspaceId, projectId);
      if (result.success) {
        const { flaggedNotes } = result.data;
        if (flaggedNotes.length > 0) {
          setSummaryMsg(
            `Summary generated. ${flaggedNotes.length} note(s) contained suspicious content and were sanitized.`
          );
        } else {
          setSummaryMsg('Summary generated.');
        }
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isEditing ? (
        <form action={handleRename} className="flex gap-2">
          <input
            name="name"
            placeholder="New name"
            required
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-sm text-gray-500"
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={handleSummarize}
            disabled={isPending}
            className="rounded border border-purple-300 bg-purple-50 px-3 py-1 text-sm text-purple-700 hover:bg-purple-100 disabled:opacity-50"
          >
            {isPending ? 'Summarizing...' : 'Summarize'}
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
          >
            Rename
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </>
      )}
      {summaryMsg && (
        <span className="text-sm text-purple-600">{summaryMsg}</span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
