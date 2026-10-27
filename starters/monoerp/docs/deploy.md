# Deploy monoERP

Any host can run the same app and setup task used locally.

- Use the Monospace image pinned by digest in `docker-compose.yml`.
- Provide a system PostgreSQL database for Monospace and a separate shared PostgreSQL database with pgvector for application data.
- Provide the external MySQL connection when Portal is selected. Its runtime login is read-only.
- Provide RabbitMQ and Valkey for clustered Monospace installations.
- Configure JWT signing and KMS keys, the public base URL, and a Monospace license covering the deployment.
- Build the app image with `apps/web/Dockerfile` from the repository root.
- Route `/api/*` to Monospace and other requests to the app. Keep both behind the same public origin so session cookies work.
- Run `infra/setup/Dockerfile` as a one-off task before serving traffic. It runs migrations and idempotent workspace setup. `infra/setup/run.sh` lists its environment settings. Use database admin credentials only for this task.
- If using connector extensions, build and install their bundles before setup and enable their allowed hosts.
- Back up both PostgreSQL databases and uploaded assets, and test restores.

The Compose `full` profile is a local example of the app, Monospace, and a Caddy reverse proxy running together.

Optional: `infra/aws` deploys this stack to AWS (`pnpm aws deploy`); see [the AWS guide](../infra/aws/README.md) for its supported connectors and setup.
