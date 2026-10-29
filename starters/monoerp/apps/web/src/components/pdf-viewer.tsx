import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

// Renders a PDF page by page onto canvases. Monospace serves non-image assets as downloads,
// so the browser's own viewer never gets a chance; pdf.js fetches the bytes itself. The
// library and its worker load on first use only.
export function PdfViewer({
  url,
  className,
  onError,
}: {
  url: string
  className?: string
  onError?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<{ url: string; doc: PDFDocumentProxy }>()
  const doc = loaded?.url === url ? loaded.doc : undefined
  const [width, setWidth] = useState(0)
  // Callers pass inline handlers; a ref keeps them from reloading the document every render.
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  // Pages fill the content box (padding excluded) and re-render when it settles on a new width.
  useEffect(() => {
    const root = ref.current

    if (!root) return
    let timer: number | undefined
    let first = true

    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry?.contentRect.width ?? 0)
      window.clearTimeout(timer)

      if (first) {
        first = false
        setWidth(next)

        return
      }

      timer = window.setTimeout(() => setWidth(next), 150)
    })

    observer.observe(root)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let task: PDFDocumentLoadingTask | undefined
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        if (cancelled) return
        task = pdfjs.getDocument({ url, withCredentials: true })
        const next = await task.promise

        if (!cancelled) setLoaded({ url, doc: next })
      } catch {
        if (!cancelled) onErrorRef.current?.()
      }
    })()

    return () => {
      cancelled = true
      // Destroying the loading task also destroys its document and frees the worker.
      void task?.destroy()
    }
  }, [url])

  useEffect(() => {
    const root = ref.current

    if (!root || !doc || !width) return
    let cancelled = false
    const canvases: Array<HTMLCanvasElement> = []
    void (async () => {
      try {
        const dpr = window.devicePixelRatio || 1

        for (let number = 1; number <= doc.numPages; number += 1) {
          const page = await doc.getPage(number)

          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: width / base.width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = `${Math.floor(viewport.width)}px`
          canvas.style.height = `${Math.floor(viewport.height)}px`
          canvas.className = 'block bg-white shadow-sm'
          const context = canvas.getContext('2d')

          if (!context) continue
          root.append(canvas)
          canvases.push(canvas)
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
          }).promise
        }
      } catch {
        if (!cancelled) onErrorRef.current?.()
      }
    })()

    return () => {
      cancelled = true

      for (const canvas of canvases) canvas.remove()
    }
  }, [doc, width])

  return (
    <div
      ref={ref}
      data-pages={doc?.numPages ?? 0}
      className={cn('flex flex-col items-center gap-3 overflow-y-auto', className)}
    />
  )
}
