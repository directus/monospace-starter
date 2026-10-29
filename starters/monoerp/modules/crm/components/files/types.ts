import type { LinkedRecord } from '@/modules/crm/components/activity-row'

export type Hide = ReadonlyArray<LinkedRecord | 'activity'>

export type UploadItem = { key: string; file: File; progress: number; failed: boolean }
