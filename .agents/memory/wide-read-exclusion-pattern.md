---
name: Wide-read exclusion pattern & subroute parity
description: How TourOps restricts domain roles and the subroutes that keep leaking
---

TourOps restricts domain/external roles by EXCLUDING them from PLATFORM_WIDE_READ_ROLES and MASTER_RECORDS_MANAGE_ROLES (filter lists in routes.ts ~L100-115). Roles excluded from wide read: city_manager, content_editor, guide_manager, hotel_manager, sights_manager, accounting, supplier, support_agent, tour_leader, transport_manager.

**Rule:** gating the top-level list endpoints is never enough. Booking SUBROUTES default to `ALL_STAFF_ROLES`/`isStaff` and silently re-open access: `/api/bookings/:id/workflows`, `/api/bookings/:id/documents`, and `/api/workflows/:id` + `/steps` (the latter pair had NO role guard at all until an architect review caught it). When touching role scoping, audit every `/api/bookings/:id/*` and `/api/workflows/*` route for parity; a `canReadWorkflow` helper now guards workflow reads (wide readers, assigned user, or flight_agent on airline).

**Why:** exact failure mode found in review after docs 9-15 — roles removed from wide reads could still fetch arbitrary bookings' workflows/documents by ID.

Also: tour_leader is scoped inline in GET /api/bookings and /api/bookings/:id (customerId/leaderUserId match), not via constants — new booking subroutes need the same branch.
