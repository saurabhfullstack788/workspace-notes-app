'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateNoteAction, deleteNoteAction } from '@/lib/actions/note-actions';

interface Note {
  id: string;
  projectId: string;
  title: string;
  content: string;
}

export function NoteEditor({
  workspaceId,
  projectId,
  note,
  canWrite,
}: {
  workspaceId: string;
  projectId: string;
  note: Note;
  canWrite: boolean;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSave() {
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set('title', title);
    formData.set('content', content);

    startTransition(async () => {
      const result = await updateNoteAction(
        workspaceId,
        projectId,
        note.id,
        formData
      );
      if (result.success) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete() {
    if (!confirm('Delete this note?')) return;
    startTransition(async () => {
      const result = await deleteNoteAction(workspaceId, projectId, note.id);
      if (result.success) {
        router.push(`/workspaces/${workspaceId}/projects/${projectId}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="note-title" className="block text-sm font-medium mb-1">
          Title
        </label>
        <input
          id="note-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
          disabled={!canWrite}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
        />
      </div>

      <div>
        <label htmlFor="note-content" className="block text-sm font-medium mb-1">
          Content
        </label>
        <textarea
          id="note-content"
          value={content}
          onChange={(e) => { setContent(e.target.value); setSaved(false); }}
          disabled={!canWrite}
          rows={12}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
        />
      </div>

      {canWrite && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      )}

      {!canWrite && (
        <p className="text-sm text-gray-500">You have view-only access to this note.</p>
      )}
    </div>
  );
}
