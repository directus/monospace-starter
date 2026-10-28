import { Code, ExternalLink, Globe, Plus, UserRoundSearch } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { FormDialog } from '@/components/form/form-dialog'
import { optionalPhone, requiredEmail, requiredText } from '@/components/form/validators'
import {
  InlineReadOnly,
  InlineRelation,
  InlineSelect,
  InlineText,
} from '@/components/inline/inline-field'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserLabel } from '@/components/users'
import type { candidatesUpdateOneInput } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { ownerOption } from '@/lib/users'
import { lookupUsers } from '@/lib/users'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { optionalUrl } from '@/modules/ats/components/candidates/candidate-form'
import { TagList, joinTags, splitTags } from '@/modules/ats/components/candidates/candidate-labels'
import type { CandidateDetail } from '@/modules/ats/data/candidates'

const copy = atsCopy.candidates

const d = copy.details

const sourceOptions = Object.entries(atsCopy.options.source).map(([value, label]) => ({
  value,
  label,
}))

const triStateOptions = [
  { value: 'unknown', label: copy.form.unknown },
  { value: 'yes', label: copy.form.yes },
  { value: 'no', label: copy.form.no },
]

const poolOptions = [
  { value: 'yes', label: copy.filters.inPool },
  { value: 'no', label: copy.filters.notInPool },
]

function triState(value: boolean | null | undefined) {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown'
}

function fromTriState(value: string) {
  return value === 'yes' ? true : value === 'no' ? false : null
}

type LinkField = 'linkedinUrl' | 'githubUrl' | 'portfolioUrl'

const LINKS: Array<{ field: LinkField; label: string; icon: typeof Globe }> = [
  { field: 'linkedinUrl', label: d.linkedin, icon: UserRoundSearch },
  { field: 'githubUrl', label: d.github, icon: Code },
  { field: 'portfolioUrl', label: d.portfolio, icon: Globe },
]

type Save = (data: candidatesUpdateOneInput) => Promise<void>

// The editable profile, in short labelled sections. Rows sit label-beside-value so the card
// stays compact; empty links collapse into one "Add link" menu instead of a row each.
export function CandidateDetails({
  candidate,
  save,
  canUpdate,
}: {
  candidate: CandidateDetail
  save: Save
  canUpdate: (field: string) => boolean
}) {
  const [addingLink, setAddingLink] = useState<LinkField>()
  const missing = LINKS.filter((link) => !candidate[link.field])

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Section title={d.contact}>
        <Row label={d.email} readOnly={!canUpdate('email')}>
          <InlineText
            label={d.email}
            type="email"
            value={candidate.email}
            validate={requiredEmail(d.email)}
            onSave={(value) => save(value ? { email: value } : {})}
          />
        </Row>
        <Row label={d.phone} readOnly={!canUpdate('phone')}>
          <InlineText
            label={d.phone}
            type="tel"
            value={candidate.phone}
            validate={optionalPhone}
            emptyLabel={d.add}
            onSave={(value) => save({ phone: value })}
          />
        </Row>
      </Section>

      <Section title={d.location}>
        <Row label={d.city} readOnly={!canUpdate('city')}>
          <InlineText
            label={d.city}
            value={candidate.city}
            emptyLabel={d.add}
            onSave={(value) => save({ city: value })}
          />
        </Row>
        <Row label={d.country} readOnly={!canUpdate('country')}>
          <InlineText
            label={d.country}
            value={candidate.country}
            emptyLabel={d.add}
            onSave={(value) => save({ country: value })}
          />
        </Row>
        <Row label={d.workAuthorized} readOnly={!canUpdate('workAuthorized')}>
          <InlineSelect
            label={d.workAuthorized}
            value={triState(candidate.workAuthorized)}
            options={triStateOptions}
            onSave={(value) => save({ workAuthorized: fromTriState(value) })}
          />
        </Row>
        <Row label={d.needsSponsorship} readOnly={!canUpdate('needsSponsorship')}>
          <InlineSelect
            label={d.needsSponsorship}
            value={triState(candidate.needsSponsorship)}
            options={triStateOptions}
            onSave={(value) => save({ needsSponsorship: fromTriState(value) })}
          />
        </Row>
      </Section>

      <Section
        title={d.links}
        action={
          missing.length && canUpdate('linkedinUrl') ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="-mr-2 h-7 text-muted-foreground" />
                }
              >
                <Plus data-icon="inline-start" />
                {d.addLink}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {missing.map(({ field, label, icon: Icon }) => (
                  <DropdownMenuItem key={field} onClick={() => setAddingLink(field)}>
                    <Icon />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      >
        {LINKS.flatMap(({ field, label, icon: Icon }) =>
          candidate[field]
            ? [
                <Row
                  key={field}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="size-3.5" />
                      {label}
                    </span>
                  }
                  readOnly={!canUpdate(field)}
                >
                  <InlineText
                    label={label}
                    type="url"
                    value={candidate[field]}
                    validate={optionalUrl}
                    format={(value) => <LinkValue value={value} />}
                    onSave={(value) => save({ [field]: value })}
                  />
                </Row>,
              ]
            : [],
        )}
        {missing.length === LINKS.length ? (
          <p className="text-sm text-muted-foreground">{d.noLinks}</p>
        ) : null}
      </Section>

      <Section title={d.sourcing}>
        <Row label={d.source} readOnly={!canUpdate('source')}>
          <InlineSelect
            label={d.source}
            value={candidate.source}
            options={sourceOptions}
            render={(value) => optionLabel('source', value)}
            onSave={(value) => save({ source: value })}
          />
        </Row>
        {candidate.source === 'agency' || candidate.source === 'job_board' ? (
          <Row
            label={candidate.source === 'agency' ? d.agency : d.sourceDetail}
            readOnly={!canUpdate('sourceDetail')}
          >
            <InlineText
              label={candidate.source === 'agency' ? d.agency : d.sourceDetail}
              value={candidate.sourceDetail}
              emptyLabel={d.add}
              validate={candidate.source === 'agency' ? requiredText(d.agency) : undefined}
              onSave={(value) => save({ sourceDetail: value })}
            />
          </Row>
        ) : null}
        {candidate.source === 'referral' ? (
          <Row label={d.referrer} readOnly={!canUpdate('referrerUserId')}>
            <InlineRelation
              label={d.referrer}
              value={ownerOption(candidate.referrerUser)}
              search={lookupUsers}
              emptyLabel={d.add}
              render={() => <UserLabel user={candidate.referrerUser} size="sm" />}
              onSave={(option) => save({ referrerUserId: option?.value ?? null })}
            />
          </Row>
        ) : null}
        <Row label={d.tags} readOnly={!canUpdate('tags')}>
          <InlineText
            label={d.tags}
            value={candidate.tags}
            emptyLabel={d.add}
            format={(value) => <TagList tags={value} className="flex-nowrap" />}
            onSave={(value) => save({ tags: joinTags(splitTags(value)) })}
          />
        </Row>
        <Row label={d.pool} readOnly={!canUpdate('inTalentPool')}>
          <InlineSelect
            label={d.pool}
            value={candidate.inTalentPool ? 'yes' : 'no'}
            options={poolOptions}
            onSave={(value) => save({ inTalentPool: value === 'yes' })}
          />
        </Row>
      </Section>

      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        {copy.profile.added(formatDate(candidate.createdAt), candidate.createdBy?.fullName ?? null)}
        {' · '}
        {copy.profile.updated(formatDate(candidate.updatedAt))}
      </p>

      {addingLink ? (
        <AddLinkDialog
          label={LINKS.find((link) => link.field === addingLink)?.label ?? ''}
          onOpenChange={(open) => !open && setAddingLink(undefined)}
          onSave={(url) => save({ [addingLink]: url })}
        />
      ) : null}
    </section>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1 border-b px-4 pt-3 pb-3 last-of-type:border-b-0">
      <div className="flex h-7 items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      <dl className="space-y-0.5">{children}</dl>
    </div>
  )
}

function Row({
  label,
  readOnly,
  children,
}: {
  label: ReactNode
  readOnly: boolean
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-x-3 text-sm max-sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <dt className="flex h-8 items-center text-muted-foreground pointer-coarse:h-10">{label}</dt>
      <dd className="min-w-0">
        <InlineReadOnly value={readOnly}>{children}</InlineReadOnly>
      </dd>
    </div>
  )
}

function LinkValue({ value }: { value: string }) {
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="truncate">{value.replace(/^https?:\/\/(www\.)?/, '')}</span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
    </a>
  )
}

function AddLinkDialog({
  label,
  onOpenChange,
  onSave,
}: {
  label: string
  onOpenChange: (open: boolean) => void
  onSave: (url: string) => Promise<void>
}) {
  const [url, setUrl] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  return (
    <FormDialog
      open
      onOpenChange={(open) => !pending && onOpenChange(open)}
      title={d.addNamed(label)}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const parsed = optionalUrl.safeParse(url.trim())

          if (!url.trim() || !parsed.success) {
            setError(parsed.error?.issues[0]?.message ?? copy.form.invalidUrl)

            return
          }

          setPending(true)

          try {
            await onSave(url.trim())
            onOpenChange(false)
          } catch (cause) {
            setError(errorMessage(cause))
            setPending(false)
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="candidate-add-link">{label}</Label>
          <Input
            id="candidate-add-link"
            type="url"
            inputMode="url"
            placeholder="https://"
            autoFocus
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setError(undefined)
            }}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {appCopy.common.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? appCopy.form.saving : copy.files.linkSave}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
