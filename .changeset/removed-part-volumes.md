---
'monoerp': patch
---

`pnpm app:remove` prints the exact `docker volume rm` command for the volumes the removed part declared. It never deletes them itself.
