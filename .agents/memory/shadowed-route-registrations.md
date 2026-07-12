---
name: Shadowed duplicate route registrations
description: In monolithic Express route files, an earlier ungated route silently wins over a later gated duplicate.
---

# Shadowed duplicate route registrations

In a large monolithic Express route registration function, the same
method+path can be registered more than once. Express dispatches to the
**first** matching handler, so a duplicate registered later never runs.

**Why:** This is a real vulnerability pattern here — rate-card endpoints had an
ungated (`isAuthenticated`-only) registration early in the file and a
role-gated (`requireRole`) duplicate hundreds of lines later. The gated one was
dead code; any logged-in user hit the ungated one first.

**How to apply:**
- When auditing or fixing auth on a route, grep the whole file for *every*
  registration of that method+path, not just the first hit. Confirm there is a
  single definition and that it is the gated one.
- When "the gate isn't working" despite a visible `requireRole`, suspect an
  earlier shadowing registration rather than a bug in the gate itself.
- Prefer collapsing to one gated definition; keep a breadcrumb comment where the
  old ungated block used to live so nobody re-adds it above the gated one.
