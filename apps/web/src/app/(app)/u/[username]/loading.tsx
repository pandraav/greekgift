/**
 * Shown while the first import runs. Reading a month out of chess.com and
 * parsing it takes a few seconds, and a blank screen for that long reads as
 * broken.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-5">
        <div className="size-[76px] shrink-0 animate-pulse rounded-full bg-white/8" />
        <div className="flex-1">
          <div className="h-2.5 w-40 animate-pulse rounded bg-white/8" />
          <div className="mt-3 h-6 w-56 animate-pulse rounded bg-white/10" />
          <div className="mt-2.5 h-2.5 w-72 animate-pulse rounded bg-white/6" />
        </div>
      </div>

      <div className="rounded-[5px] border border-black/35 bg-paper p-5 shadow-paper">
        <p className="m-0 text-[14.5px] text-ink-2">
          Reading this player&rsquo;s games from chess.com…
        </p>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-12 animate-pulse rounded bg-ink/8" />
              <div className="size-[19px] animate-pulse rounded-[3px] bg-ink/8" />
              <div className="h-3 flex-1 animate-pulse rounded bg-ink/6" />
              <div className="h-3 w-16 animate-pulse rounded bg-ink/8" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
