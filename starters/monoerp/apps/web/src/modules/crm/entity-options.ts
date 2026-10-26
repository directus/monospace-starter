import type { RelationOption } from '@/components/form/relation-combobox'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { Uuid } from '@/generated/monospace'

type OrganizationOptionValue = {
  id?: Uuid | null
  name?: string | null
  domain?: string | null
}

type ContactOptionValue = {
  id?: Uuid | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export function organizationLogo(domain: string | null | undefined) {
  return domain ? `/logo/${encodeURIComponent(domain)}` : undefined
}

export function organizationOption(
  organization: OrganizationOptionValue & { id: Uuid },
): RelationOption
export function organizationOption(
  organization: OrganizationOptionValue | null | undefined,
): RelationOption | null
export function organizationOption(
  organization: OrganizationOptionValue | null | undefined,
): RelationOption | null {
  if (!organization?.id) return null

  return {
    value: organization.id,
    label: organization.name ?? crmCopy.organizations.restricted,
    image: organizationLogo(organization.domain),
    visual: 'organization',
  }
}

export function contactOption(contact: ContactOptionValue & { id: Uuid }): RelationOption
export function contactOption(contact: ContactOptionValue | null | undefined): RelationOption | null
export function contactOption(
  contact: ContactOptionValue | null | undefined,
): RelationOption | null {
  if (!contact?.id) return null
  const name = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()

  return {
    value: contact.id,
    label:
      name || `${crmCopy.contacts.restrictedName.first} ${crmCopy.contacts.restrictedName.last}`,
    description: contact.email ?? undefined,
    visual: 'contact',
  }
}
