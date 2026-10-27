export function insertColumns<T extends { id: string }>(
  columns: T[],
  additions: { before: string; column: T }[],
): T[] {
  for (const addition of additions) {
    if (!columns.some((column) => column.id === addition.before)) {
      throw new Error(`Unknown column position: ${addition.before}`)
    }
  }

  return columns.flatMap((column) => [
    ...additions.flatMap((addition) => (addition.before === column.id ? [addition.column] : [])),
    column,
  ])
}
