'use client';

import { useRouter } from 'next/navigation';

export function WorkspaceSwitcher({
  workspaces,
  currentId,
}: {
  workspaces: { id: string; name: string }[];
  currentId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={currentId}
      onChange={(e) => router.push(`/workspaces/${e.target.value}`)}
      className="rounded border border-gray-300 px-2 py-1 text-sm font-medium"
    >
      {workspaces.map((ws) => (
        <option key={ws.id} value={ws.id}>
          {ws.name}
        </option>
      ))}
    </select>
  );
}
