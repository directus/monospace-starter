# Checkr data connector

A read-only Monospace data connector for Checkr: `candidates`, `reports`, `invitations` and `packages`.

## Data source configuration

```json
{ "apiKey": "<secret API key>", "environment": "staging" }
```

`environment` is `production` (default, `api.checkr.com`) or `staging` (`api.checkr-staging.com`). Use a staging key for staging.

## Behaviour

- Candidate SSNs, driver license numbers and mothers' maiden names are deliberately not exposed.
- Checkr filters candidates by `email`, `custom_id`, `adjudication` and creation date, and invitations by `candidate_id` and `status`; the connector sends those and filters everything else in memory, in Checkr's order. Broad filters on large accounts mean many API calls.
- Checkr has no list of reports. Every `reports` read must filter `id` or `candidate_id` with `equals` or `in`, so reports cannot be browsed on their own; expand them from a candidate instead. The `reports → invitations` relation lists invitations to resolve.
- Rate limits (1200 requests/min) surface as `RateLimited` errors; the connector does not retry.

## Build and install

From the repo root:

```sh
pnpm install
pnpm exec vitest run connectors/checkr/extension/src/data-connectors/checkr/index.test.ts
pnpm --dir connectors/checkr/extension typecheck
pnpm --dir connectors/checkr/extension build
```

The extension lives in `extension/`; the local Checkr emulator and candidate/report seed live in `emulator/`. `connector.json` lists supported environment names and source config. With no `CHECKR_API_KEY`, setup uses the local server at `http://checkr:4020`; `CHECKR_API_BASE` can override it. The local host port is `CHECKR_PORT` (default 4020).

Remove it with `pnpm app:remove checkr` or restore this whole folder, then follow [module or connector setup](../README.md). The ATS keeps working without Checkr; the background-check section shows that the source is not set up.

## Local environment

Optional `.env` settings: `CHECKR_PORT=4020`, `CHECKR_API_KEY=`, and `CHECKR_ENVIRONMENT=staging`. Without a key the source uses the local emulator. With a key it uses the selected hosted environment. Include `checkr` if overriding `OPTIONAL_SOURCES`; leave the override unset to use module declarations.
