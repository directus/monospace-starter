export function manifestDocument<T extends { readonly kind: string; readonly id: string }>(
  manifest: T,
): { readonly $schema: string }

export function manifestPath(manifest: { readonly kind: string; readonly id: string }): string
