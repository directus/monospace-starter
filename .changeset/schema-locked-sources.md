---
"monoerp": minor
---

Portal and Stripe are schema locked in Monospace, so Studio can't change their database schema. Portal is also read-only. App stays open. Connectors set this with `access` in `connector.json`, and `pnpm setup:all` applies it to existing installs too.
