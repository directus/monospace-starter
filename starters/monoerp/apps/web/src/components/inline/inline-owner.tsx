import { InlineRelation } from '@/components/inline/inline-field'
import { UserLabel, userFromOption } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import type { OwnerLike } from '@/lib/users'
import { lookupUsers, ownerOption } from '@/lib/users'

export function InlineOwner({
  owner,
  onSave,
}: {
  owner: OwnerLike | null | undefined
  onSave: (ownerUserId: Uuid | null) => Promise<void>
}) {
  return (
    <InlineRelation
      label={appCopy.common.owner}
      value={ownerOption(owner)}
      search={lookupUsers}
      emptyLabel={appCopy.inline.assign}
      render={(option) => <UserLabel user={userFromOption(option)} size="sm" className="flex" />}
      onSave={(option) => onSave(option?.value ?? null)}
    />
  )
}
