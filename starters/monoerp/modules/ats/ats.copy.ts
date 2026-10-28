// User-facing copy for the ATS module. Shared/shell copy lives in lib/app.copy.ts.
// Naming: "jobs" in the UI for requisitions (the req number is "REQ-1001"), "candidates" for
// people, "applications" only where a candidate's place on one job matters (the pipeline card).
// Each area keeps its own copy in copy/*.copy.ts; option labels shared across areas are here.
import { candidatesCopy } from '@/modules/ats/copy/candidates.copy'
import { careersCopy } from '@/modules/ats/copy/careers.copy'
import { homeCopy } from '@/modules/ats/copy/home.copy'
import { interviewsCopy } from '@/modules/ats/copy/interviews.copy'
import { jobsCopy } from '@/modules/ats/copy/jobs.copy'
import { requestsCopy } from '@/modules/ats/copy/requests.copy'
import { slidesCopy } from '@/modules/ats/copy/slides.copy'

export const atsCopy = {
  module: {
    label: 'Recruiting',
    description: 'Hiring plans, jobs, candidates, and interviews.',
  },
  home: homeCopy,
  jobs: jobsCopy,
  candidates: candidatesCopy,
  requests: requestsCopy,
  interviews: interviewsCopy,
  careers: careersCopy,
  slides: slidesCopy,
  options: {
    requisitionStatus: { draft: 'Draft', open: 'Open', on_hold: 'On hold', closed: 'Closed' },
    applicationStatus: {
      active: 'Active',
      rejected: 'Rejected',
      withdrawn: 'Withdrawn',
      hired: 'Hired',
    },
    employmentType: {
      full_time: 'Full time',
      part_time: 'Part time',
      contractor: 'Contractor',
      intern: 'Intern',
    },
    urgency: { critical: 'Critical', high: 'High', normal: 'Normal', flexible: 'Flexible' },
    urgencyImpact: {
      revenue: 'Revenue impact',
      customer: 'Customer impact',
      delivery: 'Delivery or project delay',
      workload: 'Employee workload',
      compliance: 'Compliance or risk',
      minimal: 'Minimal impact',
      other: 'Other',
    },
    hiringReason: {
      backfill: 'Backfill',
      new_capability: 'New capability',
      growth: 'Growth',
      org_change: 'Organizational change',
      compliance: 'Regulatory or compliance requirement',
      workload: 'Workload or capacity',
      workforce_plan: 'Workforce plan',
      other: 'Other',
    },
    hireType: { new: 'New headcount', replacement: 'Replacement' },
    planStatus: {
      draft: 'Draft',
      submitted: 'Awaiting approval',
      approved: 'Approved',
      declined: 'Declined',
    },
    requestStatus: {
      submitted: 'Awaiting finance',
      approved: 'Approved',
      declined: 'Declined',
      returned: 'Returned to requester',
    },
    source: {
      sourced: 'Sourced',
      website: 'Applied on website',
      linkedin: 'Applied on LinkedIn',
      job_board: 'Applied elsewhere',
      referral: 'Employee referral',
      agency: 'Agency',
      internal: 'Internal',
    },
    stageKind: {
      application: 'Application',
      screen: 'Screen',
      interview: 'Interview',
      debrief: 'Debrief',
      background_check: 'Background check',
      offer: 'Offer',
      hired: 'Hired',
    },
    recommendation: {
      strong_yes: 'Strong yes',
      yes: 'Yes',
      undecided: 'Undecided',
      no: 'No',
      strong_no: 'Strong no',
    },
    offerStatus: {
      draft: 'Draft',
      pending_approval: 'Awaiting approval',
      approved: 'Approved',
      declined: 'Declined',
      sent: 'Sent',
      accepted: 'Accepted',
      rejected: 'Turned down',
    },
    approverRole: {
      hiring_manager: 'Hiring manager',
      department_head: 'Department head',
      finance: 'Finance',
      vp_operations: 'VP Operations',
      ceo: 'CEO',
    },
    decision: {
      pending: 'Pending',
      approved: 'Approved',
      declined: 'Declined',
      returned: 'Returned',
    },
    visibility: { public: 'Public', private: 'Private' },
    interviewStatus: { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' },
  },
} as const

export type AtsOption = keyof typeof atsCopy.options

// The label for a select value, falling back to the raw value for anything unexpected.
export function optionLabel<K extends AtsOption>(kind: K, value: string | null | undefined) {
  if (!value) return ''
  const labels: Record<string, string> = atsCopy.options[kind]

  return labels[value] ?? value
}
