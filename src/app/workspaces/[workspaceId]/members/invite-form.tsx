'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteMemberAction } from '@/lib/actions/member-actions';

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await inviteMemberAction(workspaceId, formData);
      if (result.success) {
        setSuccess(true);
        router.refresh();
        const form = document.getElementById('invite-form') as HTMLFormElement;
        form?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form id="invite-form" action={handleSubmit} className="flex gap-2 items-end">
      <div>
        <label htmlFor="invite-email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          placeholder="user@example.com"
          required
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="invite-role" className="block text-sm font-medium mb-1">
          Role
        </label>
        <select
          id="invite-role"
          name="role"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Inviting...' : 'Invite'}
      </button>
      {success && <span className="text-sm text-green-600">Invited</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
