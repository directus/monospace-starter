import { MonospaceNotFoundError } from '@monospace/sdk'
import { noop, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { Briefcase, Copy, Mail, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { DataError, DataLoading, SectionBoundary } from '@/components/data-state'
import { RecordMenu } from '@/components/record-menu'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { candidatesUpdateOneInput } from '@/generated/monospace'
import type { Uuid } from '@/generated/monospace'
import { useCollectionAccess } from '@/lib/permissions'
import { ensureOrNotFound } from '@/lib/route-loaders'
import { uuidParam, uuidSchema } from '@/lib/uuid'
import { atsCopy } from '@/modules/ats/ats.copy'
import { AddToJobDialog } from '@/modules/ats/components/candidates/add-to-job-dialog'
import { ApplicationsPanel } from '@/modules/ats/components/candidates/applications-panel'
import { CandidateDetails } from '@/modules/ats/components/candidates/candidate-details'
import { CandidateHeader } from '@/modules/ats/components/candidates/candidate-header'
import { candidateName } from '@/modules/ats/components/candidates/candidate-labels'
import { EmailsPanel } from '@/modules/ats/components/candidates/emails-panel'
import { FilesPanel } from '@/modules/ats/components/candidates/files-panel'
import { HistoryPanel } from '@/modules/ats/components/candidates/history-panel'
import { NotesPanel } from '@/modules/ats/components/candidates/notes-panel'
import { OfferCallout, needsOfferCallout } from '@/modules/ats/components/candidates/offer-callout'
import { OverviewPanel } from '@/modules/ats/components/candidates/overview-panel'
import { PipelineNav } from '@/modules/ats/components/candidates/pipeline-nav'
import {
  DeleteCandidateDialog,
  PrivacyPanel,
} from '@/modules/ats/components/candidates/privacy-panel'
import { BackgroundCheckPanel } from '@/modules/ats/components/interviews/background-check-panel'
import { InterviewsPanel } from '@/modules/ats/components/interviews/interviews-panel'
import { OfferDrawer } from '@/modules/ats/components/interviews/offer-drawer'
import {
  candidateApplicationsQuery,
  candidateDetailQuery,
  candidateFilesQuery,
  candidateMessagesQuery,
  candidateNotesQuery,
  candidateOffersQuery,
} from '@/modules/ats/data/candidates'
import { candidateInterviewsQuery } from '@/modules/ats/data/interviews'
import { CandidateIcon } from '@/modules/ats/icons'
import { useDeleteCandidate, useUpdateCandidate } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates

const tabs = z.enum([
  'overview',
  'applications',
  'interviews',
  'notes',
  'files',
  'emails',
  'privacy',
  'history',
])

type Tab = z.infer<typeof tabs>

export const Route = createFileRoute('/_app/ats/candidates_/$candidateId')({
  params: { parse: ({ candidateId }) => ({ candidateId: uuidParam(candidateId) }) },
  // `job` is set when the profile was opened from that job's pipeline.
  validateSearch: z.object({
    tab: tabs.optional().catch(undefined),
    job: uuidSchema.optional().catch(undefined),
  }),
  staticData: {
    page: {
      title: copy.singular,
      icon: CandidateIcon,
      module: 'ats',
      parent: '/ats/candidates',
      recordTitle: (queryClient, { candidateId }) => {
        const record = queryClient.getQueryData(
          candidateDetailQuery(uuidParam(candidateId)).queryKey,
        )

        return record ? candidateName(record) : undefined
      },
    },
  },
  loader: async ({ context: { queryClient }, params: { candidateId } }) => {
    // The panels show their own loading state, so their reads start now without holding the page.
    void queryClient.query(candidateInterviewsQuery(candidateId)).catch(noop)
    void queryClient.query(candidateNotesQuery(candidateId)).catch(noop)
    void queryClient.query(candidateFilesQuery(candidateId)).catch(noop)
    void queryClient.query(candidateMessagesQuery(candidateId)).catch(noop)
    void queryClient.query(candidateOffersQuery(candidateId)).catch(noop)

    await Promise.all([
      ensureOrNotFound(queryClient, candidateDetailQuery(candidateId)),
      ensureOrNotFound(queryClient, candidateApplicationsQuery(candidateId)),
    ])
  },
  component: CandidatePage,
})

function CandidatePage() {
  const { candidateId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const routeNavigate = Route.useNavigate()
  const detail = useQuery(candidateDetailQuery(candidateId))
  const applications = useQuery(candidateApplicationsQuery(candidateId))
  const interviews = useQuery(candidateInterviewsQuery(candidateId))
  const notes = useQuery(candidateNotesQuery(candidateId))
  const files = useQuery(candidateFilesQuery(candidateId))
  const messages = useQuery(candidateMessagesQuery(candidateId))
  const offers = useQuery(candidateOffersQuery(candidateId))
  const [offerFor, setOfferFor] = useState<Uuid>()
  const access = useCollectionAccess('candidates')
  const update = useUpdateCandidate({ notify: false })
  const remove = useDeleteCandidate()
  const [addingToJob, setAddingToJob] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const tab: Tab = search.tab ?? 'overview'

  if (detail.isError && detail.error instanceof MonospaceNotFoundError) {
    throw notFound()
  }

  if (detail.isPending) return <DataLoading rows={8} />

  if (detail.isError) return <DataError error={detail.error} />

  const candidate = detail.data
  const name = candidateName(candidate)
  const rows = applications.data ?? []
  const active = rows.filter((application) => application.status === 'active')

  const offerOf = (applicationId: Uuid) =>
    offers.data?.find((offer) => offer.applicationId === applicationId)

  const save = async (data: candidatesUpdateOneInput) => {
    await update.mutateAsync({ id: candidateId, data })
  }

  const setTab = (next: Tab) =>
    void routeNavigate({
      search: (previous) => ({ ...previous, tab: next === 'overview' ? undefined : next }),
      replace: true,
    })

  const togglePool = () =>
    update.mutate(
      { id: candidateId, data: { inTalentPool: !candidate.inTalentPool } },
      {
        onSuccess: () =>
          toast.success(
            candidate.inTalentPool ? copy.profile.removedFromPool : copy.profile.addedToPool,
          ),
      },
    )

  const counts: Partial<Record<Tab, number | undefined>> = {
    applications: rows.length,
    interviews: interviews.data?.length,
    notes: notes.data?.length,
    files: files.data?.length,
    emails: messages.data?.length,
  }

  return (
    <div className="space-y-6">
      {search.job ? (
        <PipelineNav
          candidateId={candidateId}
          jobId={search.job}
          application={rows.find((row) => row.requisitionId === search.job)}
        />
      ) : null}
      <CandidateHeader
        candidate={candidate}
        jobs={active.flatMap((application) =>
          application.requisitions?.id
            ? [
                {
                  id: application.requisitions.id,
                  title: application.requisitions.title ?? '',
                  stage:
                    application.stages.find((stage) => stage.id === application.interviewStageId)
                      ?.name ?? '',
                },
              ]
            : [],
        )}
        onSaveName={save}
        actions={
          <>
            <Button variant="outline" className="max-sm:flex-1" onClick={() => setTab('emails')}>
              <Mail data-icon="inline-start" />
              {copy.profile.sendEmail}
            </Button>
            <Button className="max-sm:flex-1" onClick={() => setAddingToJob(true)}>
              <Briefcase data-icon="inline-start" />
              {copy.profile.addToJob}
            </Button>
            <RecordMenu>
              <DropdownMenuItem onClick={togglePool}>
                {candidate.inTalentPool ? <UserMinus /> : <UserPlus />}
                {candidate.inTalentPool ? copy.profile.removeFromPool : copy.profile.addToPool}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void navigator.clipboard
                    .writeText(candidate.email ?? '')
                    .then(() => toast.success(copy.profile.emailCopied))
                }
              >
                <Copy />
                {copy.profile.copyEmail}
              </DropdownMenuItem>
              {access.delete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      remove.reset()
                      setDeleting(true)
                    }}
                  >
                    <Trash2 />
                    {copy.profile.deleteAll}
                  </DropdownMenuItem>
                </>
              ) : null}
            </RecordMenu>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="max-lg:order-2">
          <CandidateDetails candidate={candidate} save={save} canUpdate={access.canUpdate} />
        </div>

        <Tabs
          value={tab}
          onValueChange={(next) => {
            const parsed = tabs.safeParse(next)

            if (parsed.success) setTab(parsed.data)
          }}
          className="min-w-0 gap-5"
        >
          <TabsList
            variant="line"
            className="w-full justify-start gap-4 overflow-x-auto border-b [scrollbar-width:none]"
          >
            {tabs.options.map((value) => (
              <TabsTrigger key={value} value={value} className="flex-none px-0.5">
                {copy.profile.tabs[value]}
                {counts[value] ? <Count value={counts[value]} /> : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview">
            <OverviewPanel
              candidateId={candidateId}
              applications={rows}
              offers={offers.data ?? []}
              onOpenOffer={setOfferFor}
              onOpenTab={setTab}
              onAddToJob={() => setAddingToJob(true)}
            />
            <div className="mt-5">
              <BackgroundCheckPanel candidateId={candidateId} email={candidate.email ?? null} />
            </div>
          </TabsContent>
          <TabsContent value="applications">
            {applications.isError ? <DataError error={applications.error} /> : null}
            {applications.data ? (
              <ApplicationsPanel
                candidateName={name}
                applications={rows}
                onAddToJob={() => setAddingToJob(true)}
                renderExtra={(application) => {
                  const offer = offerOf(application.id)

                  return needsOfferCallout(application, offer) ? (
                    <OfferCallout
                      application={application}
                      offer={offer}
                      onOpen={() => setOfferFor(application.id)}
                    />
                  ) : null
                }}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="interviews">
            <SectionBoundary resetKey={candidateId}>
              <InterviewsPanel candidateId={candidateId} />
            </SectionBoundary>
          </TabsContent>
          <TabsContent value="notes">
            <NotesPanel candidateId={candidateId} />
          </TabsContent>
          <TabsContent value="files">
            <FilesPanel candidateId={candidateId} />
          </TabsContent>
          <TabsContent value="emails">
            <EmailsPanel candidate={candidate} jobTitle={active[0]?.requisitions?.title} />
          </TabsContent>
          <TabsContent value="privacy">
            <PrivacyPanel
              candidate={candidate}
              onDeleteAll={() => {
                remove.reset()
                setDeleting(true)
              }}
            />
          </TabsContent>
          <TabsContent value="history">
            <HistoryPanel candidateId={candidateId} applications={rows} />
          </TabsContent>
        </Tabs>
      </div>

      {offerFor ? (
        <SectionBoundary resetKey={offerFor}>
          <OfferDrawer
            applicationId={offerFor}
            open
            onOpenChange={(open) => !open && setOfferFor(undefined)}
          />
        </SectionBoundary>
      ) : null}

      <AddToJobDialog
        candidateId={candidateId}
        candidateName={name}
        currentJobIds={rows.flatMap((row) => (row.requisitionId ? [row.requisitionId] : []))}
        open={addingToJob}
        onOpenChange={setAddingToJob}
      />

      <DeleteCandidateDialog
        open={deleting}
        onOpenChange={setDeleting}
        name={name}
        phrase={candidate.email ?? name}
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            { id: candidateId, name },
            { onSuccess: () => void navigate({ to: '/ats/candidates' }) },
          )
        }
      />
    </div>
  )
}

function Count({ value }: { value: number }) {
  return (
    <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] leading-none font-normal text-muted-foreground tabular-nums">
      {value}
    </span>
  )
}
