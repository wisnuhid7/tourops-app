---
name: Production data seeding gap (dev vs prod DB)
description: Why demo/staff accounts that work in development fail on the published app, and the safe way to seed production data.
---

Development and production use **separate** databases. Replit's Publish flow syncs the *schema* to production but does **not** copy *data*. Any rows created by a dev-side seed script (users, demo accounts, reference data) exist only in the dev DB. A freshly published app therefore has an empty/minimal prod DB, so logins with dev seed credentials fail on the deployed URL even though they work in dev.

The agent cannot write to production directly — `executeSql({ environment: "production" })` is read-only. To get seed data into prod, the write must happen from *inside the deployed app*.

**Why:** Users hit this as "I can't log in on the published app with any of the accounts you gave me." The endpoint is fine (wrong-password still returns 401); the accounts simply don't exist in the prod DB.

**How to apply:** To seed prod data, add a secret-guarded bootstrap endpoint (gated on an env var like `SEED_SECRET`) that runs an idempotent seed. Harden it: constant-time secret compare (`crypto.timingSafeEqual`), refuse once a privileged account already exists (one-time gate, so a leaked secret can't reset admin creds), and never return plaintext passwords. Set the secret in the production environment, have the user **re-publish** (new code + env var only reach prod on publish), then call the endpoint once. Remove the endpoint/secret afterward.
