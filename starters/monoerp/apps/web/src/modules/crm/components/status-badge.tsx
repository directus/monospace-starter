import { Badge } from '@/components/ui/badge'
import { labelize } from '@/lib/format'

export function StatusBadge({ status }: { status: string }) {
  const variant = status.toLowerCase() === 'active' ? 'default' : 'secondary'

  return <Badge variant={variant}>{labelize(status)}</Badge>
}
