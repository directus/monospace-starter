import type { CSSProperties } from 'react'

type StageColor = { color?: string | null }

// Stages carry a hex color in the database. Fall back to a rotating palette for unset ones.
const palette = ['#6366f1', '#0ea5e9', '#f59e0b', '#a855f7', '#10b981', '#ef4444']

export function stageColor(stage: StageColor, index = 0) {
  return (
    stage.color ?? palette[((Math.trunc(index) % palette.length) + palette.length) % palette.length]
  )
}

// Inline style vars consumed by stepper and board classes.
export function stageStyle(stage: StageColor, index = 0): CSSProperties {
  return { '--stage': stageColor(stage, index) }
}
