export default function Loading() {
  return (
    <div>
      <div className="h-7 w-28 animate-pulse rounded bg-gray-200 mb-4" />
      <ul className="space-y-2">
        {[1, 2, 3].map((i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded border border-gray-200 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="h-5 w-14 animate-pulse rounded bg-gray-100" />
          </li>
        ))}
      </ul>
    </div>
  );
}
