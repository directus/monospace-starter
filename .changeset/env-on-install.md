---
'monoerp': patch
---

The first `pnpm install` writes `.env` with free ports and its own Compose project name, so copies never share Docker data.
