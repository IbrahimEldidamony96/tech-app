export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
      <div className="mb-8 h-8 w-48 animate-pulse rounded bg-steel/15" />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-lg bg-steel/10" />
        ))}
      </div>
    </div>
  );
}
