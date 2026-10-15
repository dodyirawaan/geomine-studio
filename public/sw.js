// Offline support: the app shell and every built asset are cached at install; hashed assets are served
// cache-first, pages network-first. Each deploy registers sw.js?v=<build id>, which replaces old caches.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `geomine-${VERSION}`
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './favicon-32.png', './icon-192.png', './icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(SHELL)
      try {
        const manifest = await (await fetch('./asset-manifest.json', { cache: 'no-store' })).json()
        const files = new Set()
        for (const entry of Object.values(manifest)) {
          files.add(entry.file)
          for (const f of entry.css || []) files.add(f)
          for (const f of entry.assets || []) files.add(f)
        }
        // One by one, so a single failed download does not discard the rest; failures are cached on first use.
        const add = (f) => cache.add(`./${f}`)
        const results = await Promise.allSettled([...files].map(add))
        await Promise.allSettled([...files].filter((_, i) => results[i].status === 'rejected').map(add))
      } catch {
        // No asset list (e.g. dev build): assets are cached on first use.
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('geomine-') && key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // AI providers, OpenAlex, Crossref and GitHub are never cached.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      // no-store: skip the browser's HTTP cache (GitHub Pages allows 10 minutes), so a reload always gets the latest deploy.
      fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(async () => (await caches.match('./index.html', { ignoreVary: true })) || (await caches.match('./', { ignoreVary: true }))),
    )
    return
  }

  event.respondWith(
    // ignoreVary: module scripts are requested with an Origin header, and a Vary: Origin response would never match.
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
