export default function Loading() {
  return (
    <div>
      <div className="mb-4">
        <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="space-y-4">
        <div>
          <div className="h-4 w-10 animate-pulse rounded bg-gray-100 mb-1" />
          <div className="h-10 w-full animate-pulse rounded bg-gray-200" />
        </div>
        <div>
          <div className="h-4 w-14 animate-pulse rounded bg-gray-100 mb-1" />
          <div className="h-48 w-full animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
