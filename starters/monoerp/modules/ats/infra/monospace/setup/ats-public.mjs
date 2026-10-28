// Lets signed-out visitors use the careers page (/careers): read open, publicly posted jobs and
// their department names, and send an application. Nothing else. Applications land in
// public_applications, where a database trigger makes the candidate and application
// (modules/ats/infra/postgres/init/001_schema.sql), so visitors never read candidate data.
// Safe to rerun: updates the policy in place and attaches it to the public role once.
import {
  appSource,
  authenticate,
  findCollection,
  readCollections,
  request,
  workspacePath,
} from '../../../../../infra/monospace/setup/lib.mjs'

// The workspace's built-in role for requests without a session.
const publicRole = '00000000-0000-0000-0000-000000000001'

const policyName = 'ATS -> Public careers page'

// What a job post shows, by database column.
const jobColumns = [
  'id',
  'req_number',
  'title',
  'department_id',
  'employment_type',
  'locations',
  'description',
  'status',
  'is_confidential',
  'post_externally',
  'opened_at',
]

await authenticate()

const collections = await readCollections()

const requisitions = findCollection(collections, appSource, 'requisitions')

const departments = findCollection(collections, appSource, 'departments')

const applications = findCollection(collections, appSource, 'public_applications')

const fieldIds = (collection, columns) =>
  Object.fromEntries(
    columns.map((column) => {
      const field = collection.primitiveFields.find((candidate) => candidate.dbName === column)

      if (!field) throw new Error(`${collection.dbName}.${column} is missing`)

      return [field.apiName, {}]
    }),
  )

const content = {
  access: 'rules',
  itemRules: {
    [requisitions.apiName]: {
      read: {
        filter: {
          _and: [
            { status: { _eq: 'open' } },
            { postExternally: { _eq: true } },
            { isConfidential: { _eq: false } },
          ],
        },
      },
    },
    [departments.apiName]: { read: {} },
    [applications.apiName]: { create: {}, read: {} },
  },
  fieldRules: {
    [requisitions.apiName]: { read: fieldIds(requisitions, jobColumns) },
    [departments.apiName]: { read: fieldIds(departments, ['id', 'name']) },
    [applications.apiName]: {
      create: '*',
      read: fieldIds(applications, ['id']),
    },
  },
}

const { data: policies } = await request(`${workspacePath}/policies?limit=500`)

const existing = policies.find((policy) => policy.name === policyName)

let policyId = existing?.id

if (existing) {
  await request(`${workspacePath}/policies/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  })
} else {
  const { data } = await request(`${workspacePath}/policies`, {
    method: 'POST',
    body: JSON.stringify({ name: policyName, content }),
  })

  policyId = data.id
}

const { data: attached } = await request(`${workspacePath}/roles/${publicRole}/policies`)

if (!attached.some((policy) => policy.id === policyId)) {
  await request(`${workspacePath}/roles/${publicRole}/policies`, {
    method: 'POST',
    body: JSON.stringify({ policyId }),
  })
}

console.log(`${policyName}: ${existing ? 'updated' : 'created'}`)
