export default function Loading() {
  return (
    <div>
      <div className="mb-4">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="mb-6">
        <div className="h-7 w-44 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-16 animate-pulse rounded bg-gray-100" />
      </div>
      <ul className="space-y-2">
        {[1, 2, 3].map((i) => (
          <li
            key={i}
            className="rounded border border-gray-200 px-4 py-3"
          >
            <div className="h-5 w-36 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-100" />
          </li>
        ))}
      </ul>
    </div>
  );
}
