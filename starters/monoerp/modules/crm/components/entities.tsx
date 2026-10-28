import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { EntityAvatar } from '@/components/avatars'
import { cn } from '@/lib/utils'
import { contactName, organizationName, organizationLogo } from '@/modules/crm/entities'
import type { ContactLike, OrganizationLike } from '@/modules/crm/entities'

type Size = 'sm' | 'default' | 'lg'

const textSize: Record<Size, string> = { sm: 'text-sm', default: 'text-sm', lg: 'text-base' }

export function OrganizationAvatar({
  organization,
  size = 'default',
  className,
}: {
  organization: OrganizationLike | null | undefined
  size?: Size
  className?: string
}) {
  return (
    <EntityAvatar
      label={organizationName(organization)}
      image={organizationLogo(organization?.domain)}
      variant="square"
      size={size}
      className={className}
    />
  )
}

export function ContactAvatar({
  contact,
  size = 'default',
  className,
}: {
  contact: ContactLike | null | undefined
  size?: Size
  className?: string
}) {
  return (
    <EntityAvatar label={contactName(contact)} variant="circle" size={size} className={className} />
  )
}

function Label({
  avatar,
  primary,
  secondary,
  size,
  link,
  className,
}: {
  avatar: ReactNode
  primary: string
  secondary?: string | null
  size: Size
  link?: (children: ReactNode, className: string) => ReactNode
  className?: string
}) {
  const body = (
    <>
      {avatar}
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate font-medium',
            textSize[size],
            link && 'group-hover/entity:underline',
          )}
        >
          {primary}
        </span>
        {secondary ? (
          <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
        ) : null}
      </span>
    </>
  )

  const classes = cn(
    'group/entity inline-flex max-w-full min-w-0 items-center gap-2 align-middle',
    className,
  )

  return link ? link(body, classes) : <span className={classes}>{body}</span>
}

export function OrganizationLabel({
  organization,
  size = 'default',
  secondary,
  link = true,
  className,
}: {
  organization: OrganizationLike | null | undefined
  size?: Size
  secondary?: string | null
  link?: boolean
  className?: string
}) {
  const id = organization?.id

  return (
    <Label
      avatar={<OrganizationAvatar organization={organization} size={size} />}
      primary={organizationName(organization)}
      secondary={secondary}
      size={size}
      link={
        link && id
          ? (children, classes) => (
              <Link
                to="/crm/organizations/$organizationId"
                params={{ organizationId: id }}
                className={classes}
              >
                {children}
              </Link>
            )
          : undefined
      }
      className={className}
    />
  )
}

export function ContactLabel({
  contact,
  size = 'default',
  secondary,
  link = true,
  className,
}: {
  contact: ContactLike | null | undefined
  size?: Size
  secondary?: string | null
  link?: boolean
  className?: string
}) {
  const id = contact?.id

  return (
    <Label
      avatar={<ContactAvatar contact={contact} size={size} />}
      primary={contactName(contact)}
      secondary={secondary === undefined ? contact?.email : secondary}
      size={size}
      link={
        link && id
          ? (children, classes) => (
              <Link to="/crm/contacts/$contactId" params={{ contactId: id }} className={classes}>
                {children}
              </Link>
            )
          : undefined
      }
      className={className}
    />
  )
}
