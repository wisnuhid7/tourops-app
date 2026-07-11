---
name: Role-gated PATCH endpoints need field allowlists
description: A PATCH route restricted by role but passing req.body straight to storage still allows privilege escalation via mass-assignment.
---

Rule: when multiple roles share a PATCH/PUT endpoint but are meant to edit different subsets of a record (e.g. content_editor vs tour_builder editing the same tour, or flight_agent vs assigned staff editing the same workflow), gate at the field level, not just the role level. Build a per-role allowlist of writable keys and copy only those keys from `req.body` into the update payload — never forward `req.body` as-is once more than one role can hit the route.

**Why:** A code-review pass caught that `PATCH /tours/:id` (content_editor + tour_builder) and `PATCH /workflows/:id` (flight_agent bypass) enforced only role-based access, not field-based. Role gating alone let a lower-privilege role (e.g. content_editor) overwrite pricing/publish/structural fields by crafting a payload, since the handler blindly wrote whatever the client sent.

**How to apply:** Whenever adding a new role to an existing shared write endpoint, ask "can this role write fields another role shouldn't let it touch?" If yes, add a `Record<string, string[]>`-style allowlist per role and filter `Object.keys(req.body)` through it before calling storage — don't rely on frontend forms alone to restrict which fields get sent.
