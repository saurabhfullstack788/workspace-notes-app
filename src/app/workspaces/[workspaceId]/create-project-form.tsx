'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProjectAction } from '@/lib/actions/project-actions';

export function CreateProjectForm({ workspaceId }: { workspaceId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createProjectAction(workspaceId, formData);
      if (result.success) {
        router.refresh();
        // Clear the form
        const form = document.getElementById('create-project-form') as HTMLFormElement;
        form?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form id="create-project-form" action={handleSubmit} className="flex gap-2">
      <input
        name="name"
        placeholder="New project name"
        required
        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Creating...' : 'Create'}
      </button>
      {error && <span className="self-center text-sm text-red-600">{error}</span>}
    </form>
  );
}
