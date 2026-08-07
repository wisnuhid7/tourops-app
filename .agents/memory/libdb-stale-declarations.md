---
name: lib/db stale dist declarations
description: Why api-server typecheck fails with "missing export" after schema changes, and the fix.
---

lib/db has no build script; its dist/ declarations only regenerate when you run `npx tsc -p tsconfig.json` inside lib/db. Schema additions merged from other tasks leave dist stale, and api-server typecheck then fails with missing-export errors on the new symbols.

**Why:** completion review rejected a task solely on this — the task's own code was fine.
**How to apply:** after any lib/db schema change (yours or merged from other tasks), rebuild lib/db before running api-server typecheck; treat "symbol not exported from @workspace/db" as stale dist first, not a code bug.
