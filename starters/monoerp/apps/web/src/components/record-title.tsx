import type { ComponentProps } from 'react'

import { HEADING_WRAP, InlineName, InlineText } from '@/components/inline/inline-field'
import { cn } from '@/lib/utils'

type HeadingProps<T> = Omit<T, 'displayClassName' | 'inputClassName'>

const displayClassName = cn('text-xl font-semibold tracking-tight md:text-2xl', HEADING_WRAP)

const inputClassName = 'h-8 py-0 text-xl leading-8 font-semibold tracking-tight md:text-2xl'

export function RecordTitle(props: HeadingProps<ComponentProps<typeof InlineText>>) {
  return (
    <InlineText {...props} displayClassName={displayClassName} inputClassName={inputClassName} />
  )
}

export function RecordName(props: HeadingProps<ComponentProps<typeof InlineName>>) {
  return (
    <InlineName {...props} displayClassName={displayClassName} inputClassName={inputClassName} />
  )
}
