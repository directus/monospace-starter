// Gives every unowned interaction an owner so "Mine" on the activity page has something to
// show. Uses the workspace users in round-robin; run after the seed and setup:all.
import { authenticate, request, workspacePath } from '#setup'

await authenticate()

const items = (collection) => `${workspacePath}/items/${collection}`

const { data: users } = await request(`${workspacePath}/members?fields=id,email&limit=100`)

if (!users.length) throw new Error('No users in the workspace')

const { data: unowned } = await request(
  `${items('interactions')}?fields=id&filter[ownerUserId][_null]=true&limit=5000`,
)

let index = 0

for (const row of unowned) {
  const owner = users[index++ % users.length]
  await request(`${items('interactions')}/${row.id}?fields=id`, {
    method: 'PATCH',
    body: JSON.stringify({ ownerUserId: owner.id }),
  })
}

console.log(
  `Assigned ${unowned.length} interaction${unowned.length === 1 ? '' : 's'} across ${users.length} user${users.length === 1 ? '' : 's'}.`,
)
