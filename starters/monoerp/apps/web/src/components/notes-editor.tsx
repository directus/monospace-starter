import { Suspense, lazy } from 'react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

// BlockNote is the app's biggest dependency (about 230 KB gzipped), so it loads when notes are
// shown instead of with every record page. The placeholder has the empty editor's height
// (notes-editor.css: 14rem plus padding, and the border), so nothing moves when it arrives.
const loadEditor = () => import('./notes-block-editor')

const BlockEditor = lazy(() => loadEditor().then((module) => ({ default: module.NotesEditor })))

/** Starts loading the editor's code ahead of showing it, such as when the Notes tab is hovered. */
export function preloadNotesEditor() {
  void loadEditor()
}

export function NotesEditor(props: ComponentProps<typeof BlockEditor>) {
  return (
    <Suspense
      fallback={
        <div
          className={cn('min-h-[calc(15.5rem+2px)] rounded-xl border bg-card', props.className)}
        />
      }
    >
      <BlockEditor {...props} />
    </Suspense>
  )
}
