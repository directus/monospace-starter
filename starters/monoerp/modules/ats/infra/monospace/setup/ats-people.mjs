// Gives the ATS demo data its people. Monospace users live outside the shared app database, so the
// seed (modules/ats/infra/postgres/init/002_seed.sql) leaves user columns empty, apart from five
// placeholder ids for interviewers. This step:
//   1. makes sure a handful of demo colleagues exist as workspace members. Monospace only
//      creates users from invites, so it invites each one, reads the invite from the local mail
//      catcher (Mailpit), and signs up with its token. Skipped when Mailpit isn't reachable.
//   2. swaps the placeholder ids for those users and fills empty hiring manager, recruiter,
//      requester, approver, and department head columns, round-robin.
// Safe to rerun: existing members are reused and only empty or placeholder columns change.
import {
  apiUrl,
  authenticate,
  request,
  runSetupStep,
  workspace,
  workspacePath,
} from '../../../../../infra/monospace/setup/lib.mjs'

// AWS staging sets MAILPIT_URL to its private Mailpit task.
const mailpitUrl =
  process.env.MAILPIT_URL ?? `http://127.0.0.1:${process.env.MAILPIT_PORT ?? '8025'}`

const password = process.env.DEMO_USER_PASSWORD ?? 'monospace-demo'

// The workspace's built-in admin role, so demo users can open every ATS page.
const adminRole = '00000000-0000-0000-0000-000000000002'

// Order matters: the first two recruit, the next ones manage hiring, everyone interviews.
const people = [
  { fullName: 'Priya Raman', email: 'priya.raman@example.com' },
  { fullName: 'Tom Becker', email: 'tom.becker@example.com' },
  { fullName: 'Maya Okafor', email: 'maya.okafor@example.com' },
  { fullName: 'Lucas Moreau', email: 'lucas.moreau@example.com' },
  { fullName: 'Hannah Lee', email: 'hannah.lee@example.com' },
  { fullName: 'Diego Alvarez', email: 'diego.alvarez@example.com' },
]

const placeholders = [1, 2, 3, 4, 5].map(
  (n) => `00000000-0000-4000-8999-${String(n).padStart(12, '0')}`,
)

await authenticate()

const members = await readMembers()

if (!(await mailpitReachable())) {
  console.log(`Mailpit isn't reachable at ${mailpitUrl}; skipping demo users`)
} else {
  await runSetupStep('ATS demo colleagues', async () => {
    for (const person of people) {
      if (members.some((member) => member.email === person.email)) continue
      await invite(person)
      console.log(`Added ${person.fullName}`)
    }
  })
}

const users = (await readMembers()).filter((member) =>
  people.some((person) => person.email === member.email),
)

if (!users.length) {
  console.log('No demo users; leaving ATS people empty')
  process.exit(0)
}

const byEmail = (email) => users.find((user) => user.email === email) ?? users[0]

const recruiters = people.slice(0, 2).map((person) => byEmail(person.email).id)

const managers = people.slice(2).map((person) => byEmail(person.email).id)

const everyone = users.map((user) => user.id)

const items = (collection) => `${workspacePath}/items/${collection}`

let changed = 0

async function fill(collection, column, pool, filter = `filter[${column}][_null]=true`) {
  const { data } = await request(`${items(collection)}?fields=id&${filter}&limit=5000`)

  for (const [index, row] of data.entries()) {
    await request(`${items(collection)}/${row.id}?fields=id`, {
      method: 'PATCH',
      body: JSON.stringify({ [column]: pool[index % pool.length] }),
    })
  }

  changed += data.length
}

// Keep unmatched seed placeholders until their own demo colleague exists. Reusing another
// colleague can put the same person on one interview twice, violating its unique constraint.
for (const [index, placeholder] of placeholders.entries()) {
  const user = users.find((candidate) => candidate.email === people[index].email)?.id

  if (!user) continue

  for (const [collection, column] of [
    ['interviewParticipants', 'userId'],
    ['scorecards', 'interviewerUserId'],
  ]) {
    await fill(collection, column, [user], `filter[${column}][_eq]=${placeholder}`)
  }
}

await fill('departments', 'headUserId', managers)

await fill('roleRequests', 'hiringManagerUserId', managers)

await fill('roleRequests', 'requesterUserId', managers)

await fill('requisitions', 'hiringManagerUserId', managers)

await fill('requisitions', 'recruiterUserId', recruiters)

await fill('approvals', 'approverUserId', everyone)

console.log(`ATS people: updated ${changed} row(s) across ${users.length} demo users`)

async function readMembers() {
  const { data } = await request(`${workspacePath}/members?fields=id,email,fullName&limit=500`)

  return data
}

async function mailpitReachable() {
  return fetch(`${mailpitUrl}/api/v1/info`).then(
    (response) => response.ok,
    () => false,
  )
}

async function invite(person) {
  await request('/system/invites', {
    method: 'POST',
    body: JSON.stringify([{ email: person.email, workspace, workspaceRoles: [adminRole] }]),
  })

  const token = await inviteToken(person.email)
  const { data: providers } = await request('/auth/providers')
  const provider = providers.find((candidate) => candidate.protocol === 'password')

  await fetch(`${apiUrl}/auth/providers/${provider.apiName}/password/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token, password, fullName: person.fullName }),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Signup for ${person.email} failed: ${await response.text()}`)
  })
}

// The invite email links to the app with a `token` query parameter.
async function inviteToken(email) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const search = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
    ).then((response) => response.json())

    const id = search.messages?.[0]?.ID

    if (id) {
      const message = await fetch(`${mailpitUrl}/api/v1/message/${id}`).then((response) =>
        response.json(),
      )

      const token = `${message.HTML ?? ''} ${message.Text ?? ''}`.match(/token=([\w.-]+)/)?.[1]

      if (token) return token
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error(`No invite email for ${email} in Mailpit`)
}
