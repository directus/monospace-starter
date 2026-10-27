import { z } from 'zod'

import type { Uuid } from '@/generated/monospace'
import { UserError } from '@/lib/errors'
import { uuidSchema } from '@/lib/uuid'

// Monospace file storage. The /assets routes sit outside the OpenAPI spec, so the generated
// SDK has nothing for them; this is the same multipart POST Studio uses. CRM attachments use
// the workspace scope on purpose: those reads go through the permission engine. Avatars are
// the exception, since the whole app needs to read them.

const workspace = import.meta.env.VITE_MONOSPACE_WORKSPACE ?? 'crm'

const base = `/api/${encodeURIComponent(workspace)}/assets`

// Avatars are read from the system scope by `avatarUrl`, so they upload there too.
const systemBase = '/api/system/assets'

type AssetScope = { scope?: 'workspace' | 'system' }

const uploaded = z.object({ id: uuidSchema })

const uploadResponse = z.object({ data: z.union([z.array(uploaded), uploaded]) })

const errorBody = z.object({ message: z.string() })

const systemInfo = z.object({
  data: z.object({
    authenticated: z.object({ maxFileUploadSize: z.number() }).optional(),
  }),
})

class UploadError extends UserError {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

export function assetUrl(id: string, fileName: string, { download = false } = {}) {
  return `${base}/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}${download ? '?download=true' : ''}`
}

// XHR rather than fetch: it is the only way to get upload progress in the browser.
export function uploadAsset(
  file: File,
  {
    signal,
    onProgress,
    scope = 'workspace',
  }: {
    signal?: AbortSignal
    onProgress?: (fraction: number) => void
    scope?: 'workspace' | 'system'
  } = {},
) {
  return new Promise<Uuid>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const body = new FormData()
    body.append('file', file, file.name)
    xhr.open('POST', scope === 'system' ? systemBase : base)
    xhr.withCredentials = true
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }

    xhr.onload = () => {
      const data = uploadResponse.safeParse(xhr.response).data?.data
      const id = Array.isArray(data) ? data[0]?.id : data?.id

      if (xhr.status >= 200 && xhr.status < 300 && id) resolve(id)
      else {
        const message = errorBody.safeParse(xhr.response).data?.message ?? xhr.statusText
        reject(new UploadError(message, xhr.status))
      }
    }

    xhr.onerror = () => reject(new UploadError('Network error', 0))
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

// Missing blobs already answer 204, so only real failures throw.
export async function deleteAsset(id: string, { scope = 'workspace' }: AssetScope = {}) {
  const root = scope === 'system' ? systemBase : base

  const response = await fetch(`${root}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok && response.status !== 404) {
    throw new UploadError(`Could not delete asset (${response.status})`, response.status)
  }
}

// Server-side cap in bytes, only reported to signed-in callers.
export async function fetchUploadLimit() {
  const response = await fetch('/api/system/info', { credentials: 'include' })

  if (!response.ok) return null

  const body = systemInfo.safeParse(await response.json())

  return body.data?.data.authenticated?.maxFileUploadSize ?? null
}

// Monospace sends 64-bit integers, such as a file's size, as strings.
export function formatBytes(size: number | string | null | undefined) {
  if (size == null) return ''
  const bytes = Number(size)

  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
