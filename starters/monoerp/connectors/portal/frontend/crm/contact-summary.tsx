import { formatDateTime, labelize } from '@/lib/format'

import type { PortalUser } from './data'
import { portalCopy } from './portal.copy'

// What the customer portal knows about this person: role and last sign-in on their account.
// Matched by email, so it follows the contact if the address changes.
export function PortalUserSummary({
  user,
  loading,
  unavailable,
}: {
  user: PortalUser | null | undefined
  loading: boolean
  unavailable: boolean
}) {
  if (loading) return null

  if (unavailable) {
    return (
      <span className="text-muted-foreground">{portalCopy.organizations.portal.unavailable}</span>
    )
  }

  if (!user) {
    return <span className="text-muted-foreground">{portalCopy.contacts.notPortalUser}</span>
  }

  const portal = portalCopy.organizations.portal

  return (
    <span>
      {labelize(user.role)}
      {user.status !== 'active' ? ` · ${labelize(user.status)}` : ''}
      <span className="block text-xs text-muted-foreground">
        {portal.lastLogin}{' '}
        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : portal.neverLoggedIn.toLowerCase()}
      </span>
    </span>
  )
}
