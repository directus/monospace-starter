export function manifestDocument<T extends { readonly kind: string; readonly id: string }>(
  manifest: T,
): {
  readonly format: string
  readonly id: T['id']
}
