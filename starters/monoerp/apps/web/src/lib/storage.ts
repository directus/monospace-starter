import { appId } from '@/lib/workspace'

export function appStorageKey(key: string) {
  return `${appId}-${key}`
}
