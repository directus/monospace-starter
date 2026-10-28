// slides copy for the ATS module: the live demo deck at /slides. Merged into atsCopy in
// ../ats.copy.ts.
export const slidesCopy = {
  pageTitle: 'Hiring at Directus, built on Monospace',
  deckLabel: 'Demo slides',
  counter: (current: number, total: number) => `${current} / ${total}`,
  hint: 'Arrow keys or click to advance · F for fullscreen',
  previous: 'Previous slide',
  next: 'Next slide',
  fullscreen: 'Toggle fullscreen',
  title: {
    eyebrow: 'Directus × Monospace',
    title: 'Hiring at Directus, built on Monospace',
    subtitle: 'An applicant tracking system, built in a day.',
  },
  problem: {
    eyebrow: 'The problem',
    title: 'Hiring lives in tools that don’t talk.',
    points: [
      { title: 'Spreadsheets', description: 'Plans, approvals, and offers in docs and DMs.' },
      {
        title: 'An expensive ATS',
        description: 'Priced per seat, blind to the rest of the business.',
      },
      { title: 'GDPR and SOC\u00a02', description: 'Consent, retention, and a real audit trail.' },
    ],
  },
  flow: {
    eyebrow: 'What we built',
    title: 'From headcount plan to hired, in one place.',
    plan: 'Plan and approve',
    hire: 'Hire',
    planSteps: [
      { label: 'Workforce plan', detail: null },
      { label: 'Role request', detail: null },
      { label: 'Finance approval', detail: null },
      { label: 'Kickoff', detail: null },
      { label: 'Job', detail: null },
    ],
    hireSteps: [
      { label: 'Careers page', detail: 'Apply signed out' },
      { label: 'Pipeline', detail: null },
      { label: 'Interviews', detail: null },
      { label: 'Background check', detail: 'Checkr' },
      { label: 'Offer', detail: 'Four approvals' },
      { label: 'Hired', detail: null },
    ],
  },
  architecture: {
    eyebrow: 'How it works',
    title: 'Four sources, one API.',
    app: 'monoERP',
    appDetail: 'TanStack Start',
    api: 'Monospace',
    apiDetail: 'Joins every source with data connectors',
    apiNotes: ['Permissions on every request', 'Append-only audit log'],
    sources: [
      { name: 'PostgreSQL', detail: 'CRM and ATS' },
      { name: 'MySQL', detail: 'Customer platform · read only' },
      { name: 'Stripe', detail: 'Billing' },
      { name: 'Checkr', detail: 'Background checks' },
    ],
    hosting: 'AWS · Fargate behind CloudFront',
  },
  privacy: {
    eyebrow: 'Privacy by design',
    title: 'Built for GDPR and SOC\u00a02 from day one.',
    points: [
      { title: 'One profile per email', description: 'No duplicate copies of a person.' },
      {
        title: 'Consent and retention',
        description: 'Consent on apply, a delete-by date on every profile.',
      },
      {
        title: 'Private notes',
        description: 'Sensitive notes stay with the people who need them.',
      },
      {
        title: 'Delete all data',
        description: 'One action removes a candidate and everything about them.',
      },
    ],
  },
  demo: { title: 'Live demo', hint: 'Your applications are landing in the pipeline now.' },
  hiring: {
    eyebrow: 'We’re hiring',
    jobTitle: 'Dad Joke Concierge',
    tagline: 'Scan to apply. Puns encouraged, groans guaranteed.',
    qrLabel: (url: string) => `QR code linking to ${url}`,
  },
  thanks: {
    title: 'Thank you',
    subtitle: 'Questions?',
  },
}
