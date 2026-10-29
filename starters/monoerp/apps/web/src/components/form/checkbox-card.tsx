import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export function CheckboxCard({
  id,
  name,
  checked,
  onCheckedChange,
  onBlur,
  disabled,
  label,
  description,
  className,
}: {
  id: string
  name?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  onBlur?: () => void
  disabled?: boolean
  label: string
  description?: string
  className?: string
}) {
  const descriptionId = description ? `${id}-description` : undefined

  return (
    <label
      htmlFor={id}
      data-slot="checkbox-card"
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border border-input p-3.5 transition-[background-color,border-color,box-shadow] hover:bg-muted/50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-checked:border-primary/30 data-checked:bg-primary/5 data-disabled:pointer-events-none data-disabled:opacity-50 dark:data-checked:border-primary/20 dark:data-checked:bg-primary/10',
        className,
      )}
    >
      <Checkbox
        id={id}
        name={name}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        onBlur={onBlur}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        aria-describedby={descriptionId}
        className="mt-0.5"
      />
      <span className="min-w-0 space-y-1">
        <span id={`${id}-title`} className="block text-sm leading-none font-medium">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="block text-sm leading-snug text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  )
}
