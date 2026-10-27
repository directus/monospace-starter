export function settingsPaths(files: readonly string[]) {
  return files.map(
    (file) =>
      `/${file
        .replace('apps/web/src/routes/_app/', '')
        .replace(/\.tsx$/, '')
        .replaceAll('.', '/')}`,
  )
}
