import { expect, it } from 'vitest'

import { insertColumns } from '@/components/data-table/columns'

it('places connector columns at named anchors in contribution order', () => {
  expect(
    insertColumns(
      [{ id: 'name' }, { id: 'updated' }],
      [
        { before: 'updated', column: { id: 'plan' } },
        { before: 'name', column: { id: 'account' } },
        { before: 'updated', column: { id: 'seats' } },
      ],
    ).map((column) => column.id),
  ).toEqual(['account', 'name', 'plan', 'seats', 'updated'])
})

it('rejects a missing anchor instead of silently dropping a contribution', () => {
  expect(() =>
    insertColumns([{ id: 'name' }], [{ before: 'missing', column: { id: 'plan' } }]),
  ).toThrow('Unknown column position: missing')
})
