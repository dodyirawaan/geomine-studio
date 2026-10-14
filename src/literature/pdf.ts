// PDF text extraction in the browser with pdf.js. Loaded on demand because pdf.js is large.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

/** Text of each page, in reading order as pdf.js reports it. */
export async function extractPdfPages(data: ArrayBuffer, onProgress?: (page: number, total: number) => void): Promise<string[]> {
  const task = getDocument({ data })
  const doc = await task.promise
  const pages: string[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      pages.push(
        text
          .replace(/-\n(?=[a-z])/g, '')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      )
      onProgress?.(i, doc.numPages)
    }
  } finally {
    await task.destroy()
  }
  return pages
}

/** First DOI printed in the text (usually on page 1). */
export function findDoi(text: string): string | undefined {
  const m = /\b(10\.\d{4,9}\/[^\s"<>]+)/i.exec(text)
  return m?.[1].replace(/[.,;)\]]+$/, '').toLowerCase()
}
