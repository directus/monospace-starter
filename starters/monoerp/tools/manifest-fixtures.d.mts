export function manifestDocument<T extends { readonly kind: string; readonly id: string }>(
  manifest: T,
): {
  readonly format: string
  readonly kind: T['kind']
  readonly id: T['id']
}
