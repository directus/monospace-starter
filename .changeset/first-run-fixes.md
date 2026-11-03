---
"monoerp": patch
---

First runs no longer get stuck:

- The first `pnpm install` writes `.env` with its own Compose project name and free ports, so copies never share Docker data or ports. An existing stack under the folder name is kept.
- `pnpm setup:all` stops with a clear fix when a port belongs to another app, Monospace keeps restarting, or Docker never started the stack, and checks every published port at the end.
- Setup creates the Portal reader login itself, and the app database copies its init scripts into the container, so Docker Desktop file sharing can't block them.
- `pnpm app:remove` removes the part's Monospace source and relations (no Studio needed), prints the `docker volume rm` command for its data, and `pnpm dev` picks up the change without a restart.
- The app Docker image builds again, and the full-profile gateway has its own port.
- Demo organizations and deals get owners, and the README covers Studio's terms screen, two copies signing each other out, and Docker running out of networks.
