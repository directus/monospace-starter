// careers copy for the ATS module: the public careers site applicants see without signing in.
// Written for applicants, not the hiring team. Merged into atsCopy in ../ats.copy.ts.
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`

export const careersCopy = {
  company: 'Directus',
  notEnabled: 'The careers page is not enabled. Please check back later.',
  pageTitle: 'Careers at Directus',
  jobPageTitle: (title: string) => `${title} · Careers at Directus`,
  metaDescription: 'Open roles at Directus. Remote-first, async, and building in the open.',
  nav: { jobs: 'Open roles', home: 'directus.io', homeUrl: 'https://directus.io' },
  hero: {
    eyebrow: 'Careers',
    title: 'Build the backend the world builds on.',
    description:
      'We’re a remote-first team shipping open source data tooling used by thousands of companies. Come do the best work of your career with people who care about the craft.',
    cta: 'See open roles',
  },
  values: [
    {
      title: 'Remote first',
      description: 'Work from anywhere in our hiring regions, on your schedule.',
    },
    {
      title: 'Open by default',
      description: 'Our code, our roadmap, and most of our decisions are public.',
    },
    {
      title: 'Small team, big reach',
      description: 'Your work ships to a global community from week one.',
    },
  ],
  list: {
    title: 'Open roles',
    count: (count: number) => plural(count, 'open role'),
    search: 'Search roles',
    allDepartments: 'All departments',
    allLocations: 'All locations',
    department: 'Department',
    location: 'Location',
    clear: 'Clear filters',
    empty: 'We don’t have any open roles right now. Check back soon.',
    emptyFiltered: 'No roles match those filters.',
    roles: (count: number) => plural(count, 'role'),
    loadFailed: 'We couldn’t load our open roles. Refresh the page to try again.',
  },
  job: {
    back: 'All open roles',
    apply: 'Apply for this role',
    applyShort: 'Apply',
    about: 'About the role',
    noDescription: 'Full details are coming soon. Apply and we’ll share more in the first call.',
    req: (number: number | null) => (number ? `REQ-${number}` : ''),
    posted: 'Posted',
    closedTitle: 'This role isn’t open anymore',
    closedDescription:
      'It may have been filled or paused. Have a look at the roles we’re hiring for now.',
    closedAction: 'See open roles',
    loadFailed: 'We couldn’t load this role. Refresh the page to try again.',
  },
  form: {
    title: 'Apply',
    description:
      'It takes about two minutes. We only ask for what we need to review your application.',
    required: 'Required',
    you: 'About you',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    city: 'City',
    country: 'Country',
    eligibility: 'Work eligibility',
    workAuthorized: 'Are you legally authorized to work in the country you live in?',
    needsSponsorship: 'Will you now or in the future need visa sponsorship to work?',
    yes: 'Yes',
    no: 'No',
    skip: 'Prefer not to say',
    links: 'Your work',
    linksHint: 'A LinkedIn profile is fine in place of a resume.',
    linkedin: 'LinkedIn',
    github: 'GitHub',
    portfolio: 'Portfolio or website',
    resume: 'Resume link',
    resumeHint: 'A link to a PDF or document we can open, like Google Drive or Dropbox.',
    resumeFileName: 'Resume',
    invalidUrl: 'Enter a full link starting with https://',
    consent:
      'I’ve read the Candidate Privacy Notice and agree to Directus processing my information to review my application.',
    consentRequired: 'Please agree to the privacy notice so we can review your application.',
    submit: 'Submit application',
    submitting: 'Submitting…',
    closed: 'This role stopped taking applications. Please choose another open role.',
    failed: 'Something went wrong sending your application. Please try again in a moment.',
  },
  success: {
    title: (name: string) => `Thanks, ${name}. Your application is in.`,
    description: (job: string) =>
      `We’ve received your application for ${job}. A real person on our recruiting team reads every one.`,
    nextTitle: 'What happens next',
    next: [
      'We review your application, usually within a week.',
      'If it’s a fit, a recruiter emails you to set up a first call.',
      'Either way, we’ll let you know where things stand.',
    ],
    more: 'See other open roles',
  },
  privacy: {
    title: 'Candidate Privacy Notice',
    summary: 'How we handle your information',
    intro:
      'Directus collects only what we need to consider you for a role. Here’s what that means.',
    sections: [
      {
        title: 'What we collect',
        body: 'Your name and email, and anything optional you choose to share: phone, city, country, work eligibility, professional links, and your resume. We don’t ask for a cover letter, salary history, or demographic information.',
      },
      {
        title: 'Why we collect it',
        body: 'To review your application, contact you about it, and confirm you can work where you’d be based. We process it with your consent, which you give below.',
      },
      {
        title: 'How it’s used',
        body: 'Only for recruiting at Directus: assessing your fit for this role, scheduling interviews, and making a hiring decision. We never sell it or use it for marketing.',
      },
      {
        title: 'Who sees it',
        body: 'The recruiting team and the people involved in hiring for the role, such as the hiring manager and interviewers. Our recruiting system provider stores it for us under contract.',
      },
      {
        title: 'How long we keep it',
        body: '12 months from when you apply, so we can consider you for future roles. After that we delete it, unless you’ve joined us or asked us to keep it longer.',
      },
      {
        title: 'Your rights',
        body: 'You can ask to see, correct, export, or delete your information, or withdraw your consent, at any time. Withdrawing doesn’t affect anything we did before.',
      },
      {
        title: 'Contact us',
        body: 'Email privacy@directus.io about your information or this notice.',
      },
    ],
  },
  footer: {
    copyright: (year: number) => `© ${year} Directus`,
    equal:
      'Directus is an equal opportunity employer. We welcome applicants of every background and identity.',
  },
} as const
