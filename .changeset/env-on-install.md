---
'monoerp': patch
---

The first `pnpm install` writes `.env` with free ports and its own Compose project name, so copies never share Docker data. A checkout that already has a stack under its folder name keeps it.
