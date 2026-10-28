import type { RelationOption } from '@/components/form/relation-combobox'
import type { Uuid } from '@/generated/monospace'
import { optionsFrom } from '@/lib/format'
import { crmCopy } from '@/modules/crm/crm.copy'

export type OrganizationLike = {
  id?: Uuid | null
  name?: string | null
  domain?: string | null
}

export type ContactLike = {
  id?: Uuid | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export function organizationName(organization: OrganizationLike | null | undefined) {
  return organization?.name ?? crmCopy.organizations.restricted
}

export function contactName(contact: ContactLike | null | undefined) {
  const name = `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim()

  return name || `${crmCopy.contacts.restrictedName.first} ${crmCopy.contacts.restrictedName.last}`
}

export function organizationLogo(domain: string | null | undefined) {
  return domain ? `/logo/${encodeURIComponent(domain)}` : undefined
}

export function organizationOption(organization: OrganizationLike & { id: Uuid }): RelationOption
export function organizationOption(
  organization: OrganizationLike | null | undefined,
): RelationOption | null
export function organizationOption(
  organization: OrganizationLike | null | undefined,
): RelationOption | null {
  if (!organization?.id) return null

  return {
    value: organization.id,
    label: organizationName(organization),
    image: organizationLogo(organization.domain),
    variant: 'square',
  }
}

export function contactOption(contact: ContactLike & { id: Uuid }): RelationOption
export function contactOption(contact: ContactLike | null | undefined): RelationOption | null
export function contactOption(contact: ContactLike | null | undefined): RelationOption | null {
  if (!contact?.id) return null

  return {
    value: contact.id,
    label: contactName(contact),
    description: contact.email ?? undefined,
    variant: 'circle',
  }
}

export const organizationStatusOptions = optionsFrom(crmCopy.organizations.statuses)

export const contactStatusOptions = optionsFrom(crmCopy.contacts.statuses)

export const dealStatusOptions = optionsFrom(crmCopy.deals.statuses)
