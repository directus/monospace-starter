---
"monoerp": patch
---

`pnpm setup:all` creates the Portal `monospace_reader` login (or resets its password) before it connects Portal, so a MySQL database created without it no longer fails with "Access denied". The app database copies its init scripts into the container, so Docker Desktop file sharing can't block them.
