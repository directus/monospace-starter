// Gives every unowned organization, deal, and activity an owner, so the Owner columns and "Mine"
// have something to show. Uses the workspace users in round-robin; run after the seed and
// setup:all. Rows that already have an owner are left alone, so rerunning is safe.
import { authenticate, request, workspacePath } from '../../../../../infra/monospace/setup/lib.mjs'

await authenticate()

const items = (collection) => `${workspacePath}/items/${collection}`

const { data: users } = await request(`${workspacePath}/members?fields=id,email&limit=100`)

if (!users.length) throw new Error('No users in the workspace')

const collections = [
  ['organizations', 'organization', 'organizations'],
  ['deals', 'deal', 'deals'],
  ['activities', 'activity', 'activities'],
]

const counts = []

for (const [collection, one, many] of collections) {
  const { data: unowned } = await request(
    `${items(collection)}?fields=id&filter[ownerUserId][_null]=true&limit=5000`,
  )

  let index = 0

  for (const row of unowned) {
    const owner = users[index++ % users.length]
    await request(`${items(collection)}/${row.id}?fields=id`, {
      method: 'PATCH',
      body: JSON.stringify({ ownerUserId: owner.id }),
    })
  }

  counts.push(`${unowned.length} ${unowned.length === 1 ? one : many}`)
}

console.log(
  `Assigned ${counts.join(', ')} across ${users.length} user${users.length === 1 ? '' : 's'}.`,
)
