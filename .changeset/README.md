# Changesets

Every PR that changes a starter adds a changeset: run `npx changeset` from the repository root, pick the starter and the bump, and write one or two sentences for its changelog. CI fails the PR without one. For a change that doesn't belong in the changelog, use `npx changeset --empty`.

| Bump    | When                                                                            |
| ------- | ------------------------------------------------------------------------------- |
| `patch` | Fixes: a bug, a wrong doc, a dependency update                                  |
| `minor` | A new module, connector, or deploy target, or a notable feature                 |
| `major` | A part renamed or removed, or a breaking change to a manifest format            |

Merging to `main` opens a "Version starters" PR that bumps each changed starter's `package.json`, writes its `CHANGELOG.md`, and updates `catalog.json`. Merging that PR tags each new version as `<starter>@<version>` and creates a GitHub release from its changelog.
