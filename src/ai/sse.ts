import { rateLimitFrom } from './rateLimit'

/** Yields the `data:` payload of each server-sent event in a fetch response body. */
export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error('Response has no body')
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let idx: number
    while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
      const event = buf.slice(0, idx)
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '')
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (data) yield data
    }
  }
}

/** Turns a non-2xx response into a readable error. */
export async function httpError(res: Response, provider: string): Promise<Error> {
  let detail = ''
  try {
    const body = await res.json()
    if (res.status === 429) return rateLimitFrom(provider, body, res.headers)
    detail = body?.error?.message ?? body?.message ?? JSON.stringify(body)
  } catch {
    detail = res.statusText
  }
  return Object.assign(new Error(`${provider} ${res.status}: ${detail}`), { status: res.status })
}
