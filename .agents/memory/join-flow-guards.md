---
name: Group join flow guards
description: Where group-join business rules live and the bypass/UX traps found during booking-engine QA
---
- All group joins must go through the dedicated join endpoint; the generic booking-create endpoint rejects `join_leader_group` outright. **Why:** the share-link dialog once posted joins directly to booking-create, bypassing group-status/self-join/duplicate guards and dropping the leader link.
- **How to apply:** any new join surface (UI or API) calls POST /api/bookings/join with joinCode; the server derives leader/group/departure/price from the resolved leader booking — never trust client price or leader id.
- Duplicate joins are enforced by a partial unique index `uniq_active_group_membership` (customer, leader, tour, departure; non-cancelled join bookings). Read-then-insert checks alone race; catch pg 23505 → 409.
- Lookup endpoints that feed pre-membership UI (e.g. booking-by-join-code) must return a minimal shaped response for non-owners instead of 403 — a 403 silently kills the join dialog for exactly its target users.
- The bookings status enum has NO 'rejected' value (draft/submitted/confirmed/cancelled/completed); code that checks for 'rejected' never matches and raw SQL with it errors.
- Client double-submit guard pattern: `submittingRef` + wrapper around mutate, reset in onSettled — `isPending`-disabled buttons alone race with fast double-clicks.
