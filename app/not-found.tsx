import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-semibold text-ink">Page not found</h1>
      <p className="text-steel">The page or product you requested does not exist.</p>
      <Link href="/" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper">
        Back to store
      </Link>
    </main>
  );
}
