import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Link2,
  Presentation,
} from 'lucide-react'

export const fileIcons = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  link: Link2,
  other: File,
}

export function kindOf(row: {
  contentType?: string | null
  url?: string | null
}): keyof typeof fileIcons {
  if (row.url) return 'link'
  const type = row.contentType ?? ''

  if (type.startsWith('image/')) return 'image'

  if (type.startsWith('video/')) return 'video'

  if (type.startsWith('audio/')) return 'audio'

  if (type === 'application/pdf') return 'pdf'

  if (type.includes('sheet') || type.includes('excel') || type === 'text/csv') return 'sheet'

  if (type.includes('presentation') || type.includes('powerpoint')) return 'slides'

  if (type.startsWith('text/') || type.includes('document')) return 'text'

  if (type.includes('zip') || type.includes('compressed') || type.includes('tar')) return 'archive'

  return 'other'
}

export function hostOf(url: string | null | undefined) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}
