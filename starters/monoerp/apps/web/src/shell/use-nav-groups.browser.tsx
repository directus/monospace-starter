import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { appStorageKey } from '@/lib/storage'
import { useNavGroups } from '@/shell/use-nav-groups'

const KEY = appStorageKey('sidebar-closed-groups')

type Page = { module: string | undefined; path: string }

describe('useNavGroups', () => {
  beforeEach(() => window.localStorage.clear())

  it('remembers a closed group', () => {
    const { result, unmount } = renderHook(() => useNavGroups(undefined, '/'))

    expect(result.current.isOpen('sales')).toBe(true)
    act(() => result.current.setOpen('sales', false))
    expect(result.current.isOpen('sales')).toBe(false)
    expect(window.localStorage.getItem(KEY)).toBe('["sales"]')
    unmount()

    const { result: again } = renderHook(() => useNavGroups(undefined, '/'))

    expect(again.current.isOpen('sales')).toBe(false)
  })

  it('opens the group of the page you go to', () => {
    window.localStorage.setItem(KEY, '["hiring"]')

    const { result, rerender } = renderHook<ReturnType<typeof useNavGroups>, Page>(
      ({ module, path }) => useNavGroups(module, path),
      { initialProps: { module: undefined, path: '/' } },
    )

    expect(result.current.isOpen('hiring')).toBe(false)
    rerender({ module: 'hiring', path: '/hiring/jobs' })
    expect(result.current.isOpen('hiring')).toBe(true)
    expect(window.localStorage.getItem(KEY)).toBe('[]')
  })

  it('ignores a corrupt saved value', () => {
    window.localStorage.setItem(KEY, '{nope')

    const { result } = renderHook(() => useNavGroups(undefined, '/'))

    expect(result.current.isOpen('sales')).toBe(true)
  })
})
