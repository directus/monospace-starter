import { expect, it } from 'vitest'

import { crossSourceRelations } from './remove-source.mjs'

const relation = (id, oppositeCollectionId, oppositeFieldId) => ({
  id,
  oppositeCollectionId,
  oppositeFieldId,
})

it('deletes each relation pair that crosses into the source once, and leaves the rest', () => {
  const collections = [
    {
      id: 'organizations',
      sourceId: 'app',
      relationFields: [relation('org-account', 'accounts', 'account-orgs')],
    },
    {
      id: 'accounts',
      sourceId: 'portal',
      relationFields: [
        relation('account-orgs', 'organizations', 'org-account'),
        relation('account-plan', 'plans', 'plan-accounts'),
      ],
    },
    {
      id: 'plans',
      sourceId: 'portal',
      relationFields: [relation('plan-accounts', 'accounts', 'account-plan')],
    },
    { id: 'deals', sourceId: 'app', relationFields: [relation('deal-org', 'organizations', 'x')] },
  ]

  expect(crossSourceRelations(collections, 'portal')).toEqual([
    {
      kind: 'deleteRelationFieldPair',
      data: { firstFieldId: 'org-account', secondFieldId: 'account-orgs' },
    },
  ])
})
