import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Main script of a page, e.g. "assets/index-D3cyE_lr.js": its hash changes with every deploy. */
const scriptOf = (html: string) => html.match(/assets\/index-[\w-]+\.js/)?.[0]

/**
 * The app is a single page kept open for hours, so a new deploy would otherwise go unnoticed. Checks on focus and every
 * ten minutes whether the published page loads a different main script, and offers a reload.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const current = scriptOf(document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.src ?? '')
    if (!current) return
    let stopped = false
    async function check() {
      if (stopped || document.visibilityState !== 'visible') return
      try {
        const html = await (await fetch(`${import.meta.env.BASE_URL}index.html?t=${Date.now()}`, { cache: 'no-store' })).text()
        const latest = scriptOf(html)
        if (latest && latest !== current) setReady(true)
      } catch {
        // Offline: try again later.
      }
    }
    const timer = setInterval(check, 10 * 60 * 1000)
    document.addEventListener('visibilitychange', check)
    void check()
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (!ready) return null
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      A new version of GeoMine Studio is available.
      <button type="button" className="inline-flex items-center gap-1 font-medium underline" onClick={() => window.location.reload()}>
        <RefreshCw className="h-3.5 w-3.5" /> Reload
      </button>
    </div>
  )
}
