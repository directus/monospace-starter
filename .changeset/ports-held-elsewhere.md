---
'monoerp': patch
---

The first `pnpm install` also skips ports that any Docker container publishes (running or stopped) and ports in neighboring folders' `.env`, so a copy whose stack is down keeps its ports.
