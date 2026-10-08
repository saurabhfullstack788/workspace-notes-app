export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="h-7 w-28 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-gray-100 mb-4" />
      <ul className="space-y-2">
        {[1, 2, 3].map((i) => (
          <li
            key={i}
            className="rounded border border-gray-200 px-4 py-3"
          >
            <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          </li>
        ))}
      </ul>
    </div>
  );
}
