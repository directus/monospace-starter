export function selectFeatures<T>(
  paths: ReadonlyArray<string>,
  entry: (path: string) => T | undefined,
) {
  return paths.map((path) => {
    const feature = entry(path)

    if (!feature) throw new Error(`Selected feature entry is missing: ${path}/feature.tsx`)

    return feature
  })
}
