# monoerp

## 0.1.1

### Patch Changes

- [#9](https://github.com/directus/monospace-starter/pull/9) [`36bf6b0`](https://github.com/directus/monospace-starter/commit/36bf6b08510c662fabc92801260f3f03854b5d3e) Thanks [@bryantgillespie](https://github.com/bryantgillespie)! - First runs no longer get stuck:

  - The first `pnpm install` writes `.env` with its own Compose project name and free ports, so copies never share Docker data or ports. An existing stack under the folder name is kept.
  - `pnpm setup:all` stops with a clear fix when a port belongs to another app, Monospace keeps restarting, or Docker never started the stack, and checks every published port at the end. `pnpm dev` stops when `APP_PORT` is taken on IPv4 or IPv6.
  - Setup creates the Portal reader login itself, and the app database copies its init scripts into the container, so Docker Desktop file sharing can't block them.
  - `pnpm app:remove` removes the part's Monospace source and relations (no Studio needed), prints the `docker volume rm` command for its data, and `pnpm dev` picks up the change without a restart.
  - The app Docker image builds again, and the full-profile gateway has its own port.
  - Demo organizations and deals get owners, and the README covers Studio's terms screen, two copies signing each other out, and Docker running out of networks.

- [`84e7c76`](https://github.com/directus/monospace-starter/commit/84e7c768760913e6dcbbde213522dd56bf1d4115) Thanks [@JamesW1](https://github.com/JamesW1)! - Run on Monospace v1.1.0.

## 0.1.0

### Minor Changes

- [#6](https://github.com/directus/monospace-starter/pull/6) [`1b62d4b`](https://github.com/directus/monospace-starter/commit/1b62d4b6b15746158e4eeb3ea4558b971526f029) Thanks [@bryantgillespie](https://github.com/bryantgillespie)! - First release of monoERP: a modular CRM app on Monospace with the CRM module, Portal and Stripe connectors, and an AWS deploy target.
