import { Link, createFileRoute } from '@tanstack/react-router'
import { Briefcase, CircleDot, Mail } from 'lucide-react'

import { DataTableMobileRow } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import { ListTable } from '@/components/data-table/list-table'
import { ListBulkActions, ownerBulkField, statusBulkField } from '@/components/list-bulk-actions'
import { ListControls, ListAddButton } from '@/components/list-controls'
import { ListWorkspace } from '@/components/list-workspace'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useListPage } from '@/hooks/use-list-page'
import { appCopy } from '@/lib/app.copy'
import { filtersToClause, relationField } from '@/lib/filters'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'
import { formatDate } from '@/lib/format'
import { listSearchSchema, parseSort } from '@/lib/list-search'
import { useCollectionAccess } from '@/lib/permissions'
import { groupAffiliations, groupTitle } from '@/modules/crm/affiliations'
import { ContactDrawer } from '@/modules/crm/components/contact-form'
import { ContactAvatar, ContactLabel, OrganizationLabel } from '@/modules/crm/components/entities'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { contactsPagesQuery, lookupOrganizations, resolveOrganizations } from '@/modules/crm/data'
import type { ContactRow, ContactsFilter } from '@/modules/crm/data'
import { contactName, organizationName, contactStatusOptions } from '@/modules/crm/entities'
import { ContactIcon, OrganizationIcon } from '@/modules/crm/icons'
import { useDeleteManyContacts, useUpdateManyContacts } from '@/modules/crm/mutations'

const filterFields: Array<ListFilterField> = [
  {
    id: 'status',
    label: appCopy.common.status,
    type: 'select',
    kind: 'option',
    defaultOperator: 'is_any_of',
    searchable: false,
    icon: <CircleDot />,
    options: contactStatusOptions,
  },
  relationField({
    id: 'organization',
    label: crmCopy.organizations.singular,
    icon: <OrganizationIcon />,
    placeholder: appCopy.form.searchPlaceholder(crmCopy.organizations.title),
    search: lookupOrganizations,
    resolve: resolveOrganizations,
    toClause: (clause) => ({ affiliations: { _some: { organizationId: clause } } }),
  }),
  {
    id: 'title',
    label: crmCopy.contacts.jobTitle,
    type: 'text',
    icon: <Briefcase />,
    toClause: (clause) => ({ affiliations: { _some: { title: clause } } }),
  },
  { id: 'email', label: crmCopy.contacts.form.email, type: 'text', icon: <Mail /> },
]

function clauseFor(query: ListFilterQuery | undefined) {
  // SAFETY: filtersToClause only emits operators valid for each field type. The generated filter
  // schema can't check it yet (docs/monospace.md, known issues).
  return filtersToClause(filterFields, query) as ContactsFilter | undefined
}

export const Route = createFileRoute('/_app/crm/contacts')({
  staticData: {
    page: {
      title: crmCopy.contacts.title,
      icon: ContactIcon,
      module: 'crm',
      nav: 30,
      keywords: crmCopy.contacts.keywords,
      fullWidth: true,
      fill: true,
    },
  },
  validateSearch: listSearchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q,
    filter: clauseFor(search.filters),
    sort: parseSort(search.sort),
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.infiniteQuery({ ...contactsPagesQuery(deps), staleTime: 'static' })
  },
  component: ContactsPage,
})

function groupsFor(contact: ContactRow) {
  return groupAffiliations(contact.affiliations?.data ?? [], (row) => row.organization?.id).filter(
    (group) => !group.isFormer,
  )
}

// One organization per row keeps row heights uniform; the rest sit behind a "+N" that opens on
// hover or click.
function OrganizationsCell({ contact }: { contact: ContactRow }) {
  const groups = groupsFor(contact)
  const [first, ...rest] = groups

  if (!first) return null

  return (
    <div className="flex min-w-0 items-center gap-2">
      <OrganizationLabel organization={first.current?.organization} size="sm" />
      {rest.length ? (
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={150}
            render={
              <button
                type="button"
                aria-label={crmCopy.contacts.moreOrganizations(rest.length)}
                className="relative inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted data-[popup-open]:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
              />
            }
          >
            +{rest.length}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-48 gap-2 p-2">
            {rest.map((group) => (
              <OrganizationLabel
                key={group.key}
                organization={group.current?.organization}
                size="sm"
              />
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

const columns: Array<DataTableColumn<ContactRow>> = [
  {
    id: 'name',
    header: crmCopy.contacts.singular,
    accessorFn: (row) => row.lastName ?? '',
    size: 260,
    enableHiding: false,
    cell: ({ row }) => <ContactLabel contact={row.original} />,
  },
  {
    id: 'title',
    header: crmCopy.contacts.jobTitle,
    enableSorting: false,
    cell: ({ row }) => groupsFor(row.original).map(groupTitle).find(Boolean) ?? null,
  },
  {
    id: 'organizations',
    header: crmCopy.organizations.title,
    enableSorting: false,
    size: 240,
    cell: ({ row }) => <OrganizationsCell contact={row.original} />,
  },
  {
    id: 'email',
    header: crmCopy.contacts.form.email,
    accessorFn: (row) => row.email ?? '',
    size: 220,
    cell: ({ row }) => row.original.email,
  },
  {
    id: 'status',
    header: appCopy.common.status,
    accessorFn: (row) => row.status ?? '',
    size: 120,
    cell: ({ row }) => <StatusBadge status={row.original.status ?? 'unknown'} />,
  },
  {
    id: 'updatedAt',
    header: appCopy.common.updated,
    accessorFn: (row) => row.updatedAt ?? '',
    size: 130,
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right text-muted-foreground' },
    cell: ({ row }) => formatDate(row.original.updatedAt),
  },
]

function ContactRowMobile({ contact }: { contact: ContactRow }) {
  const groups = groupsFor(contact)

  const meta = [
    groups.map(groupTitle).find(Boolean),
    groups[0] ? organizationName(groups[0].current?.organization) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <DataTableMobileRow
      render={
        contact.id ? (
          <Link to="/crm/contacts/$contactId" params={{ contactId: contact.id }} />
        ) : undefined
      }
      leading={<ContactAvatar contact={contact} />}
      title={contactName(contact)}
      meta={[meta || contact.email]}
    />
  )
}

function ContactsPage() {
  const access = useCollectionAccess('contacts')
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const page = useListPage({
    id: 'contacts',
    columns,
    search,
    onSearchChange: (patch) => navigate({ search: (previous) => ({ ...previous, ...patch }) }),
    params: Route.useLoaderDeps(),
    query: contactsPagesQuery,
    selectable: true,
  })

  const { list: contacts, selectedIds, clearSelection } = page

  const updateMany = useUpdateManyContacts()
  const deleteMany = useDeleteManyContacts()

  return (
    <ListWorkspace
      title={crmCopy.contacts.title}
      icon={ContactIcon}
      controls={
        <ListControls
          state={page}
          fields={filterFields}
          title={crmCopy.contacts.title}
          icon={ContactIcon}
          defaultSort={{ id: 'name', desc: false, label: crmCopy.contacts.singular }}
          selection={
            selectedIds.length ? (
              <ListBulkActions
                canUpdate={access.canUpdate}
                ids={selectedIds}
                noun={crmCopy.contacts.title}
                singular={crmCopy.contacts.singular}
                fields={[statusBulkField(contactStatusOptions), ownerBulkField]}
                onClear={clearSelection}
                onUpdate={async (ids, data) => {
                  await updateMany.mutateAsync({ ids, data })
                }}
                onDelete={
                  access.delete
                    ? async (ids) => {
                        await deleteMany.mutateAsync(ids)
                      }
                    : undefined
                }
                deleting={deleteMany.isPending}
                deleteError={deleteMany.error}
              />
            ) : undefined
          }
          action={
            access.create ? (
              <ContactDrawer
                trigger={<ListAddButton label={appCopy.form.add(crmCopy.contacts.singular)} />}
              />
            ) : null
          }
        />
      }
    >
      <ListTable
        query={contacts}
        {...page.tableProps}
        noun={crmCopy.contacts.title}
        mobileRow={(contact) => <ContactRowMobile contact={contact} />}
      />
    </ListWorkspace>
  )
}
