---
name: Staging test-data engine
description: Invariants for the TourOps test-seed/reset system and lessons learned building it
---

- Reset must delete only rows the seeder provably owns: fixed user IDs, exact slugs/codes it created, and rate cards by `createdBy IN (test user ids)` — never `LIKE 'TEST-%'` prefix matching (a real staging row could use that convention). **Why:** architect review flagged prefix deletes as unsafe.
- Test-data endpoints are super_admin only AND hard-blocked when `NODE_ENV==='production'` or `REPLIT_DEPLOYMENT` is set (`testSeedBlockedReason()`); the frontend banner is driven by public `GET /api/environment`.
- Drizzle `sql\`... = ANY(${array})\`` expands the array as a tuple and fails at runtime. Use `inArray()` or `sql.join(ids.map(id => sql\`${id}\`), sql\`, \`)` inside `IN (...)`.
- Pricing anchor: seed's Biblical Israel scenario must sell double/choice-1 at exactly **$3,408** (seed validation + unit test both lock it). Hotel double ROOM rate $200/night → resolver halves to $100/person.
- Concurrent-mutation guard pattern: status transitions and payment recording use compare-and-swap in the UPDATE's WHERE (previous status / previous paidAmount) and return 409 when the row moved.
- The global test banner is `fixed bottom-0` because the landing page's fixed top header overlays anything placed in normal flow at the top.
