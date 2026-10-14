// GeoMine Studio logo: a hexagonal rock block (crystal / geology) cut by two strata seams, with a tunnel portal.

const MARK = (
  <>
    <path d="M32 3l25.5 14.75v28.5L32 61 6.5 46.25v-28.5z" fill="#f59e0b" />
    <path d="M6.5 28L57.5 17v4.5L6.5 32.5z" fill="#b45309" />
    <path d="M6.5 36L57.5 25v3L6.5 39z" fill="#b45309" opacity=".55" />
    <path d="M20.5 51V40.5a11.5 11.5 0 0 1 23 0V51z" fill="#1c1917" />
  </>
)

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      {MARK}
    </svg>
  )
}

/** Mark with the "GeoMine Studio" wordmark; `compact` hides "Studio" on small screens. */
export function Logo({ size = 30, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="GeoMine Studio">
      <LogoMark size={size} />
      <span className="leading-none font-semibold tracking-tight" style={{ fontSize: size * 0.6 }}>
        GeoMine
        <span className={`font-normal text-stone-500 dark:text-stone-400 ${compact ? 'hidden sm:inline' : ''}`}> Studio</span>
      </span>
    </span>
  )
}
