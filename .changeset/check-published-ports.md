---
'monoerp': patch
---

`pnpm setup:all` ends by checking every published port: it names one that another app answers, one where nothing answers, or a container still on an old port, with the fix. The `--profile full` gateway has its own `GATEWAY_PORT`, so it no longer sits on top of `pnpm dev`.
