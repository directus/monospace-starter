import { cn } from '@/lib/utils'
import { stageStyle } from '@/modules/crm/stage-color'

type StageDotValue = { color?: string | null; position?: number | null }

export function StageDot({
  stage,
  index = (stage.position ?? 1) - 1,
  className,
}: {
  stage: StageDotValue
  index?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2.5 shrink-0 rounded-full bg-(--stage)', className)}
      style={stageStyle(stage, index)}
    />
  )
}
