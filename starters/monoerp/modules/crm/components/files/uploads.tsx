import { useQueryClient } from '@tanstack/react-query'
import type { ChangeEvent } from 'react'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { formatBytes, uploadLimitQuery } from '@/lib/assets'
import { useCollectionAccess } from '@/lib/permissions'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentTarget } from '@/modules/crm/data'
import { useUploadAttachment } from '@/modules/crm/mutations'

import type { UploadItem } from './types'

const copy = crmCopy.files

// Files picked from anywhere (drop zone, Upload button, header menu) go through here: a size
// check against the server cap, then one upload at a time so progress reads left to right.
export function useUploads({ notify = false } = {}) {
  const { mutateAsync } = useUploadAttachment({ notify })
  const queryClient = useQueryClient()
  const [uploads, setUploads] = useState<Array<UploadItem>>([])

  const patch = (key: string, next: Partial<UploadItem>) =>
    setUploads((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)))

  const add = useCallback(
    async (files: Iterable<File>, target: AttachmentTarget) => {
      const limit = await queryClient.query(uploadLimitQuery()).catch(() => null)

      for (const file of files) {
        if (limit && file.size > limit) {
          toast.error(copy.tooLarge(file.name, formatBytes(limit)))
          continue
        }

        const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
        setUploads((current) => [...current, { key, file, progress: 0, failed: false }])

        try {
          await mutateAsync({
            file,
            target,
            onProgress: (fraction) => patch(key, { progress: fraction }),
          })
          setUploads((current) => current.filter((item) => item.key !== key))
        } catch {
          patch(key, { failed: true })
        }
      }
    },
    [mutateAsync, queryClient],
  )

  const dismiss = (key: string) =>
    setUploads((current) => current.filter((item) => item.key !== key))

  return { uploads, add, dismiss }
}

// A hidden file input plus a way to open it, for menu items and buttons outside the panel.
export function useFilePicker(onFiles: (files: Iterable<File>) => void) {
  const ref = useRef<HTMLInputElement>(null)

  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      className="hidden"
      tabIndex={-1}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files?.length) onFiles(Array.from(event.target.files))
        event.target.value = ''
      }}
    />
  )

  return { input, pick: () => ref.current?.click() }
}

// For record headers: an "Attach file" action that uploads straight to the record. The target
// is passed at pick time so the hook can sit above a page's loading returns.
export function useAttachFiles() {
  const access = useCollectionAccess('attachments')
  const { add } = useUploads({ notify: true })
  const pending = useRef<AttachmentTarget | null>(null)

  const picker = useFilePicker((files) => {
    if (pending.current) void add(files, pending.current)
  })

  return {
    input: picker.input,
    pick: (target: AttachmentTarget) => {
      if (!access.create) return
      pending.current = target
      picker.pick()
    },
  }
}
