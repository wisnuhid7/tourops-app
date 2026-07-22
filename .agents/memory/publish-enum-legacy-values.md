---
name: Publish-time enum migration & legacy values
description: How to fix publish failures caused by prod rows holding enum values removed from the dev schema.
---

Rule: never remove/rename a Postgres enum value that production rows may still hold — the publish-time enum cast aborts the whole migration (`invalid input value for enum ...`).

**Why:** Publish diffs dev vs prod schema and casts columns to the new enum; any prod row with a value missing from the dev enum fails the cast. Prod is read-only for the agent, so the fix must be dev-side.

**How to apply:**
- Keep the legacy value in the dev enum (documented as legacy) so the cast succeeds.
- Remap the data via app-level startup maintenance: data-only, idempotent, guarded by `pg_try_advisory_lock`, no DDL.
- Startup account top-up must NEVER auto-create privileged roles (super_admin/admin) — known-password admin backdoor; privileged bootstrap stays behind the secret-guarded one-time seed endpoint.
- The "copy dev data to production" Publish checkbox only appears when the prod DB is first created; existing deployments don't get it.
