import { useState } from 'react'
import { z } from 'zod'

const STORAGE_KEY = 'crm-sidebar-closed-groups'

const closedGroups = z.array(z.string())

function readClosed() {
  try {
    const parsed = closedGroups.safeParse(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]'),
    )

    return new Set(parsed.success ? parsed.data : [])
  } catch {
    return new Set<string>()
  }
}

function writeClosed(closed: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...closed]))
  } catch {
    // Private mode or a full quota: the groups still work, they just aren't remembered.
  }
}

function withGroup(closed: Set<string>, id: string, open: boolean) {
  if (closed.has(id) !== open) return closed

  const next = new Set(closed)

  if (open) next.delete(id)
  else next.add(id)

  writeClosed(next)

  return next
}

// Which sidebar module groups are open. Groups start open; the ones you close are remembered in
// localStorage. Going to a page in a closed group opens it, so the current page is never hidden.
export function useNavGroups(activeModule: string | undefined, pathname: string) {
  const [closed, setClosed] = useState(readClosed)
  const [seenPath, setSeenPath] = useState<string>()

  // Checked while rendering, not in an effect, so a reopened group never paints closed first.
  if (pathname !== seenPath) {
    setSeenPath(pathname)

    if (activeModule && closed.has(activeModule)) setClosed(withGroup(closed, activeModule, true))
  }

  return {
    isOpen: (id: string) => !closed.has(id),
    setOpen: (id: string, open: boolean) => setClosed((current) => withGroup(current, id, open)),
  }
}
