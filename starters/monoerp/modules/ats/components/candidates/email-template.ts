// Email templates use {{snake_case}} placeholders. Known ones are filled from the candidate and
// sender; unknown ones stay as typed so the sender sees what still needs a value.
export type TemplateValues = Record<string, string | null | undefined>

export function fillTemplate(text: string, values: TemplateValues) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => values[key] || match)
}

export function candidateTemplateValues({
  candidate,
  jobTitle,
  senderName,
}: {
  candidate: { firstName?: string | null; lastName?: string | null; email?: string | null }
  jobTitle?: string | null
  senderName?: string | null
}) {
  const fullName = [candidate.firstName, candidate.lastName].filter(Boolean).join(' ')

  return {
    candidate_first_name: candidate.firstName,
    candidate_last_name: candidate.lastName,
    candidate_name: fullName,
    candidate_full_name: fullName,
    candidate_email: candidate.email,
    first_name: candidate.firstName,
    job_title: jobTitle,
    role_title: jobTitle,
    company_name: 'Directus',
    company: 'Directus',
    recruiter_name: senderName,
    sender_name: senderName,
  } satisfies TemplateValues
}

export const PRIVACY_NOTICE_TEMPLATE = 'Privacy Notice'
