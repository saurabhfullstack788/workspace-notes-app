import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Not found</h2>
      <p className="text-sm text-gray-500 mb-6">
        The workspace, project, or note you requested does not exist or you do
        not have access.
      </p>
      <Link
        href="/workspaces"
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Back to workspaces
      </Link>
    </div>
  );
}
