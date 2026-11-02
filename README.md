<p align="center">
  <picture style="display:block;">
    <source width="400" media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/27299ab8-c2a3-45d8-bf65-e830adefb454">
    <source width="400" media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/fd1b456b-ca81-4ce1-a9a3-3285e16d7088">
    <img alt="Monospace" src="https://github.com/user-attachments/assets/fd1b456b-ca81-4ce1-a9a3-3285e16d7088">
  </picture>
</p>
<p align="center">
  <a href="https://monospace.io">Website</a> • <a href="https://docs.monospace.io">Documentation</a> • <a href="https://monospace.productlane.com/roadmap">Roadmap</a>
</p>

Monospace connects the databases and APIs your organization already runs and puts one governed API in front of them. Each data source you register gets a REST API, a typed TypeScript SDK, an MCP server, and an admin app called the Studio, all reading and writing live data under the same permissions.

<img width="3810" height="2280" alt="Monospace Studio" src="monospace-hero.png" />

## Quickstart

You need [Docker Compose](https://docs.docker.com/compose/install/).

```bash
curl -fL https://docs.monospace.io/quick-start | docker compose -f - up
```

Or clone this repo and run `docker compose up -d`.

Open the Studio at <http://localhost:8100>. The first start takes a minute or two. Then follow the [Quickstart guide](https://docs.monospace.io/en/getting-started/installation) to create a workspace and connect a data source.

Without a license key, the instance runs on the Starter plan. To add one, set `MONOSPACE_LICENSE__KEY` in `docker-compose.yml`. See [Licensing](https://docs.monospace.io/en/reference/licensing).

## Agent Skills

[`monospace-agent-skills`](https://github.com/directus/monospace-agent-skills) teaches your coding agent the Monospace API, SDK, and MCP tools.

```bash
# Claude Code
claude plugin marketplace add directus/monospace-agent-skills
claude plugin install monospace@monospace-agent-skills

# Other agents
npx skills add directus/monospace-agent-skills
```

## Starters

Complete projects you can run locally and adapt to your own data.

| Starter | Description |
|---|---|
| [`monoerp`](starters/monoerp) | A modular CRM built with TanStack Start, joining PostgreSQL, MySQL, and Stripe through one API |

Grab a single starter without cloning the whole repo:

```bash
npx giget@latest gh:directus/monospace-starter/starters/monoerp monoerp
cd monoerp
```

Then follow its [Quickstart](starters/monoerp#quickstart) to install dependencies, start the stack, and sign in. You'll need Node 24, pnpm, and Docker.

Each starter runs its own Monospace on port 8100, so stop the root stack first.

Each starter is versioned on its own: releases are tagged `<starter>@<version>` (for example `monoerp@0.1.0`) with a `CHANGELOG.md` in its folder. See [releases](https://github.com/directus/monospace-starter/releases) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Extensions

Data connector extensions let you add APIs and other systems as data sources. They're in preview, so the config format may change.

```bash
npx @monospace/cli extension create ./acme-store --id acme/store --name "Acme Store"
```

See the [CLI reference](https://docs.monospace.io/en/reference/cli#scaffold-a-data-connector) for building and loading an extension into your local instance.

## Support

This repo doesn't take issues.

- [Report a bug](https://monospace.productlane.com/support)
- [Request a feature](https://monospace.productlane.com/request)

## License

© Monospace, Inc. All rights reserved. Use is subject to the [Monospace Terms](https://monospace.io/terms). Starters carry their own licenses.
