# Starters

Each folder here is a complete project built on Monospace: its data model, a working app, and the parts (modules, connectors, deploy targets) a reader can keep or remove. [`catalog.json`](../catalog.json) lists them; `node tooling/catalog.mjs` rebuilds it.

| Starter              | What it is                                            |
| -------------------- | ----------------------------------------------------- |
| [`monoerp`](monoerp) | A modular business app, CRM first, over three sources |

## The README format

Every `starters/<name>/README.md` opens the same way and has these sections, in this order. `node tooling/catalog.mjs --check` fails when one is missing or out of order. Add other sections where they fit, but keep these.

1. **Header:** the Monospace logo (light and dark), the starter's name as a centered `h1`, a one-line pitch, and a row of links (Quickstart, the guide, deploy, Monospace, Monospace docs).
2. **Hero screenshot:** the app at 1440 wide, under 400 KB, committed in `.github/assets/`.
3. `## What's inside`: what the starter shows and a table of its modules, connectors, and deploy targets. Copy labels and descriptions from the manifests so they match `catalog.json`.
4. `## Quickstart`: `npx @monospace/cli create` (once the CLI ships), then the manual path that works today, through to a signed-in app.
5. `## Everyday commands`: the scripts a reader runs day to day.
6. `## Project layout`: a short tree, and a sentence on how the pieces talk to each other.
7. `## Removing parts`: `pnpm app:remove <id>` and what changes.
8. `## Deploy`
9. `## Docs`: a table of the guides in `docs/`.
10. `## License`

Skeleton:

```markdown
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/monospace-logo-on-dark.svg">
    <img alt="Monospace" src=".github/assets/monospace-logo-on-light.svg" width="360">
  </picture>
</p>

<h1 align="center">Name</h1>

<p align="center">One line on what it is.</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> • <a href="docs/getting-started.md">Getting started guide</a> • <a href="docs/deploy.md">Deploy</a> • <a href="https://monospace.io">Monospace</a> • <a href="https://docs.monospace.io">Monospace docs</a>
</p>

<p align="center"><img alt="..." src=".github/assets/hero.png" width="900"></p>

## What's inside
## Quickstart
## Everyday commands
## Project layout
## Removing parts
## Deploy
## Docs
## License
```
