# Contributing

## Adding or changing a starter

A starter is a folder in [`starters/`](starters) with its own pnpm workspace, lockfile, and `package.json` (`"name"` is the folder name, `"private": true`). Work inside the starter as usual; nothing at the repository root changes how it installs or runs.

Before opening a PR:

1. **Add a changeset.** From the repository root, run `npm ci` once, then `npx changeset`. Pick the starter, the bump, and write a line for its changelog. See [`.changeset/README.md`](.changeset/README.md) for which bump to pick.
2. **Rebuild the catalog** if you added, removed, or renamed a starter or part, or changed a label or description: `node tooling/catalog.mjs`, then commit `catalog.json`.
3. **Run the check:** `node tooling/catalog.mjs --check`. It fails when `catalog.json` is stale or a starter README is missing a required section. CI runs it too, then `pnpm verify` in each starter.

New starters start at version `0.0.0` with a `minor` changeset, so the first release is `0.1.0`.

### Releases

Merging to `main` opens a "Version starters" PR. Merging that PR tags each new version as `<starter>@<version>` (for example `monoerp@0.1.0`) and creates a GitHub release with that version's changelog.

The root `package.json` installs only the Changesets tools. `lerna.json` tells Changesets the starters live in `starters/*`; Lerna itself isn't used, and neither npm nor pnpm reads that file, so each starter keeps its own workspace and lockfile.

### The starter README

Every `starters/<name>/README.md` opens with a header and a hero, then has these sections. Order is up to you, and extra sections are fine; `--check` only fails when one is missing.

- `## What's inside`: what the starter shows, and a table of its modules, connectors, and deploy targets. Copy labels and descriptions from the manifests so they match `catalog.json`.
- `## Quickstart`: `npx @monospace/cli create` (once the CLI ships), then the manual path that works today, through to a signed-in app.
- `## Everyday commands`: the scripts a reader runs day to day.
- `## Project layout`: a short tree, and a sentence on how the pieces talk to each other.
- `## Removing parts`: `pnpm app:remove <id>` and what changes.
- `## Deploy`
- `## Docs`: a table of the guides in `docs/`.
- `## License`

Header and hero:

- The Monospace logo (light and dark), the starter's name as a centered `h1`, a one-line pitch, a row of badges, and a row of links.
- A short looping GIF of the app, light and dark, each under 3 MB, captured at 1440×900 and scaled to 1200 wide. Sign in off camera and hide dev tools. Commit images to `starters/<name>/.github/assets/`.

Copy this skeleton and fill it in:

```markdown
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/monospace-logo-on-dark.svg">
    <img alt="Monospace" src=".github/assets/monospace-logo-on-light.svg" width="240">
  </picture>
</p>

<h1 align="center">Name</h1>

<p align="center">One line on what it is.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2f6feb"></a>
  <a href="https://monospace.io"><img alt="Built on Monospace" src="https://img.shields.io/badge/built%20on-Monospace-2f6feb"></a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> •
  <a href="docs/getting-started.md">Getting started guide</a> •
  <a href="docs/deploy.md">Deploy</a> •
  <a href="https://github.com/directus/monospace-starter/releases?q=name">Releases</a> •
  <a href="https://docs.monospace.io">Monospace docs</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/tour-dark.gif">
    <img alt="What the loop shows" src=".github/assets/tour-light.gif" width="900">
  </picture>
</p>

## What's inside

## Quickstart

## Everyday commands

## Project layout

## Removing parts

## Deploy

## Docs

## License
```
