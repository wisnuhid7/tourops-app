# Project Features — TourOps Travel & Tour Management System

> Generated 2026-07-23 from a full scan of `artifacts/api-server` (Express 5 + Drizzle/PostgreSQL), `artifacts/tourops` (React + Vite), `artifacts/mockup-sandbox`, docs, and project tasks.
>
> Legend: `[x]` ✅ Completed · `[~]` 🚧 In Progress / Partial · `[ ]` ❌ Not Implemented · `[!]` ⚠️ Needs Review

## Authentication & Accounts
- [x] ~~Session-based login/logout (express-session + connect-pg-simple, PostgreSQL sessions)~~ ✅ tested
- [x] ~~Customer self-registration~~ ✅ tested
- [x] ~~Portal-aware login (customer / admin / staff portals share one auth backend)~~ ✅ tested
- [x] ~~User profile management (`/api/user-profile`; role stored in `user_profiles`)~~ ✅ tested
- [x] ~~Iframe-compatible cookies (SameSite=None + Secure + Partitioned) with Origin/Host CSRF guard~~ ✅ tested
- [x] ~~One-time secret-guarded demo/prod seed bootstrap endpoint~~ ✅ tested
- [x] ~~Account lifecycle enforcement — deactivated (`isActive:false`) profiles blocked at login (AUTH-01)~~ ✅ tested
- [x] ~~Session ID regeneration on login/registration (session-fixation defense, AUTH-02)~~ ✅ tested
- [x] ~~Unified password policy (`MIN_PASSWORD_LENGTH = 8`) across register / admin-create / admin-reset (AUTH-06)~~ ✅ tested
- [x] ~~Brute-force protection: per-IP rate limit + per-account lockout (5 fails → 15-min lock) (AUTH-07)~~ ✅ tested
- [x] ~~Password reset / forgot password~~ ✅ tested — hashed single-use tokens, no account enumeration (see `docs/qa/security-features-2026-07-27.md`)
- [x] ~~Two-factor authentication~~ ✅ tested — TOTP (otplib) with QR enrollment, 2-step login, code-gated disable
- [x] ~~Email verification~~ ✅ tested — auto-sent at registration, resend + `/verify-email` page
- [x] ~~`getOrCreateProfile` auto-creates a "customer" profile for any user without one~~ ✅ fixed — fail-closed 403; only customer-portal login may provision a customer profile

## Authorization (RBAC)
- [x] ~~19-role `user_role` enum with granular staff/supplier/customer roles~~ ✅ tested
- [x] ~~`requireRole` gating across API routes (ADMIN_ROLES, STAFF_ROLES, catalog role allowlists)~~ ✅ tested
- [x] ~~Role-aware sidebar + role-based dashboard routing~~ ✅ tested — consolidated into single `src/lib/roles.ts` source (AUTHZ-03)
- [x] ~~Field-level PATCH allowlists (tours: content_editor vs tour_builder; departures)~~ ✅ tested
- [x] ~~Supplier row-scoping (`own_only` / createdBy isolation for supplier catalogs)~~ ✅ tested
- [x] ~~Country-manager row scoping (country_id ownership incl. GET filtering)~~ ✅ tested
- [x] ~~QA authorization test plan (14 roles) — full assessment executed; see `docs/qa/manu/authorization-*.md`~~ ✅ tested
- [x] ~~All `/api/master/*/import` routes now enforce `requireRole`~~ ✅ tested (regression RG-01)
- [x] ~~Draft-tour exposure guard: unpublished tour details/sub-resources return 404 to non-staff (AUTHZ-01)~~ ✅ tested
- [x] ~~Profile auto-creation diagnostic logging (AUTHZ-02)~~ ✅ tested
- [x] ~~Task #4: hide unpublished tour details from anonymous visitors~~ ✅ fixed & retested (AUTHZ-01)
- [x] ~~Task #10: keep supplier catalog data out of customer accounts~~ ✅ tested — 403
- [x] ~~Task #12: content editors can't change tour prices or publish status~~ ✅ tested — fields blocked
- [x] ~~Task #19: catch specific pages hidden behind catch-all URL patterns~~ ✅ tested — no API-level leak; SPA guards confirmed & hardened (customers redirected out of `/admin`, `/ops`, `/supplier` shells)

## Tours & Itinerary
- [x] ~~Tour CRUD (tours, tour_days, tour_day_items) with publish status~~ ✅ tested — TOUR-01/TOUR-04 fixed & retested 2026-07-27 (negative prices → 400; duplicate slug → 409)
- [x] AI tour/itinerary generator (`admin/tour-generator.tsx`, gpt-5 backend)
  - [~] Hardcoded fallback itinerary generator when OpenAI unavailable
- [x] ~~Tour detail page (public + customer views) with itinerary, hotels, guides~~ ✅ tested (`docs/qa/manu/tours-*.md`)
- [x] ~~"Starting From" pricing (lowest open-departure price, base-price fallback)~~ ✅ tested — lowest open departure verified, closed/sold-out ignored
- [x] ~~Child pricing (proportional to departure adult price, capped at adult price)~~ ✅ tested — TOUR-02 fixed & retested 2026-07-27 (child > adult rejected server-side on POST and PATCH)
- [x] ~~Tour brochure page (`customer/tour-brochure.tsx`)~~ ✅ tested — incl. brochure PDF spot-check
- [x] ~~Browse tours with search, category, duration, price slider, date-range filters~~ ✅ tested — search/filters/sort/pagination verified

## Departures
- [x] ~~Departure CRUD (`/admin/departures`): create, edit (dates/capacity/price/status/public-join), delete~~ ✅ tested 2026-07-27 — create/edit all fields/delete verified; negative price rejected
- [x] ~~Delete protection — 409 when bookings are linked to a departure~~ ✅ tested 2026-07-27 — 409 with linked booking, delete succeeds after unlink
- [x] ~~Server-side PATCH field allowlist (tourId / capacityBooked not client-mutable)~~ ✅ tested (authorization QA, field-level allowlists)
- [x] ~~Departure statuses (open / closed / sold_out / cancelled) + public-join toggle~~ ✅ tested — status handling verified via "Starting From" open-departure tests
- [x] ~~Promo departure pricing (departure price may be below tour base price)~~ ✅ tested 2026-07-27 — departure at 800 vs base 1000/1200 accepted and served publicly

## Bookings & Group Travel
- [x] ~~Booking engine: private and group tours~~ ✅ QA passed 2026-07-31 — duplicate-submit bug fixed & retested (`docs/qa/manu/booking-engine.md`)
- [x] ~~Join-group flow via invitation/join codes (uses departure price)~~ ✅ QA passed 2026-07-31 — cancelled/duplicate/self-join guards added (`docs/qa/manu/group-tour.md`)
- [x] ~~Traveler/passenger management (`manage-passengers.tsx`, travelers table)~~ ✅ QA passed 2026-07-31 — Manage Passengers link added to booking detail (`docs/qa/manu/travelers.md`)
- [x] ~~Group-leader features (`leader-dashboard.tsx`, `leader-payments.tsx`)~~ ✅ QA passed 2026-07-31 (`docs/qa/manu/leader-features.md`)
- [x] ~~Customer post-booking: `my-bookings.tsx`, `booking-detail.tsx`~~ ✅ QA passed 2026-07-31 incl. IDOR checks
- [x] ~~Admin order management (`admin/bookings.tsx`, `admin/booking-detail.tsx`)~~ ✅ QA passed 2026-07-31 (`docs/qa/manu/admin-bookings.md`)
- [x] ~~Multi-step service workflow system per booking (Airline, Hotel, Transport, Guide, Sights steps)~~ ✅ QA passed 2026-07-31 (`docs/qa/manu/workflow.md`)
  - [x] ~~`admin/workflow-detail.tsx` — complex multi-step UI, partially polished~~ ✅ redesigned (timeline, inline notes editor) & verified 2026-07-31
- [x] ~~Booking assignments (staff/resource allocation, `admin/assignments.tsx`)~~ ✅ QA passed 2026-07-31 — allowlist & notes-only PATCH re-verified (`docs/qa/manu/assignments.md`)
  - [x] ~~Known bug: PATCH `/api/assignments/:id` with notes-only body → 500~~ ✅ fixed — missing `notes` column added + strict field allowlist (see `docs/qa/security-features-2026-07-27.md`)

## Payments
- [x] ~~Payments table + admin payments page (`admin/payments.tsx`)~~ ✅ extended 2026-07-31 — provider/intent/transaction ids, subtotal/taxes/fees/discount, refunded_amount, refund_status, metadata; admin page rebuilt with server-side search/filter/sort/pagination, detail dialog, refund UI (e2e verified)
- [x] Payment status email notification (`sendPaymentStatusNotification`) — now also fired via webhook pipeline with in-app notifications
- [x] ~~Payment gateway integration~~ ✅ 2026-07-31 — provider abstraction (`lib/payments/`) with offline test provider: intents, HMAC-signed webhooks (replay protection, idempotent via `payment_events` unique (provider,event_id)), ~10 normalized event types. Stripe slots in later as another provider (user deferred connecting Stripe)
- [x] ~~Online checkout for customers~~ ✅ `/checkout/:bookingId` — order summary (subtotal/taxes/fees/discount), duplicate-payment prevention, session recovery, success/failed/processing states with polling (e2e verified)
- [x] ~~Refund management~~ ✅ full/partial refunds with reasons + notes, FINANCE_ROLES-only, over-refund guard, audit logs, customer notifications, refund history in admin dialog (e2e verified)

## Suppliers & Supply Chain
- [x] Supplier portals: airline_supplier, hotel_manager, guide_manager, sights_manager
- [x] Hotel, sight, transport-company, airline-agency catalog management
- [x] Rate cards (`admin/rate-cards.tsx`) — note: numeric price columns expect strings in insert schema
- [~] Airline flight search/pricing — simulated prices (distance/seasonality), not a real GDS
- [~] `supplier/airline-search.tsx` — partially integrated (redirects into supplier tab)
- [x] Transport module (bus types, transport routes) — accessible at both `/admin/transport` and `/ops/transport` (duplicate route)

## Ops Dashboards (staff roles)
✅ QA passed 2026-07-31 — role-based access verified across all staff roles via authenticated API tests (`docs/qa/manu/ops-dashboards-{summary,findings,testing-suite,testing-report}.md`). No auth bypass, privilege escalation, or cross-role data leak; each dashboard's data endpoints are gated to the correct role(s), unauthorized staff/customers get 403, and direct-URL access to another role's dashboard loads only role-gated data.
- [x] ~~Content editor (`ops/content-editor.tsx`)~~ ✅ `/api/tours` gated to content_editor+admin; cannot change tour price/publish (allowlist enforced)
- [x] ~~Transport manager (`ops/transport-dashboard.tsx`)~~ ✅ `/api/transport/*` role-enforced in-handler; `/admin/transport` and `/ops/transport` share the same API with identical authz
- [x] ~~Flight agent (`ops/flight-agent.tsx`)~~ ✅ `/api/flight-agent/workflows` + `/api/rates/airline` + `/api/flights/search` gated to flight roles+admin
- [x] ~~Tour leader (`ops/tour-leader.tsx`)~~ ✅ `/api/bookings` row-scoped to assigned bookings only
- [x] ~~City manager (`ops/city-manager.tsx`)~~ ✅ city/country master data gated
- [x] ~~Accounting (`ops/accounting.tsx`)~~ ✅ `/api/payments` restricted to accounting+admin (support/flight/leader/city/customer 403)
- [x] ~~Support agent (`ops/support.tsx`)~~ ✅ booking access gated; payments forbidden
- [x] ~~Generic fallback dashboard (`ops/generic-dashboard.tsx`)~~ ✅ used only for roles without a dedicated view; renders only role-gated data (no privileged leak)
- [x] ~~Open: `/api/bookings` full-list visibility (OD-01)~~ ✅ Fixed 2026-07-31 — dedicated `BOOKING_READ_ROLES` allowlist (management + accounting + support_agent); flight_agent & tour_builder excluded (their dashboards never consume bookings); tour_leader stays row-scoped. Verified per role via API.
- [x] ~~Tech-debt: role→dashboard defined across 3 parallel maps (OD-02)~~ ✅ Fixed 2026-07-31 — `lib/roles.ts` `ROLE_HOME`/`getRoleHome` is now the single source; sidebar dashboard links and login-form redirect derive from it (behavior unchanged, drift no longer possible).

## Master Data
- [x] Countries, cities, airports, sights, hotels management (`admin/master-data.tsx`)
- [x] Master record import endpoints (cities, etc.)
  - [x] ~~Import routes now enforce explicit `requireRole` checks~~ ✅ tested (RG-01)
- [~] Data scrapers (country/city/sight/hotel ingestion) — simulated logic, no real external fetches
- [~] Price intelligence tables (`hotel_price_snapshots`, `flight_price_snapshots`) — schema exists, fed by simulated services

## AI & Intelligence
- [x] OpenAI gpt-5 via Replit AI integration (itineraries, translation, sight enrichment, business analytics)
- [x] Lazy background entity translation (ES/ID) for hotels, guides, tour day items (`translations` jsonb + completeness verification, chunked batches)
- [x] Public-safe translation shaping (`pickPublicTranslations` — never leaks internal notes/policies)
- [x] AI generation job tracking (`ai_generation_jobs` table)
- [x] ~~Upgrade gpt-4o → gpt-5 (proposed task #21)~~ ✅ tested — all 6 call sites in `ai.ts`, live generator smoke test passed

## Internationalization
- [x] Three UI languages: English, Spanish, Indonesian (single dictionary in `use-language.tsx` / `translations.ts`)
- [x] Dynamic DB-content localization (`lt` helper + backend translation layer)
- [!] Missing keys render raw in all languages; only caught by `tsc` (TS2345), not by build

## Notifications & Messaging
- [x] Email system: Nodemailer + background email queue (`emailQueue.ts`) for bookings, assignments, status updates
- [x] Email queue monitoring (back office)
- [x] Internal messaging (`messages` table, `admin/messages.tsx`)
- [ ] SMS / push notifications
- [ ] In-app real-time notifications

## Documents & Files
- [x] Image uploads via multer to local disk (`uploads/images`)
- [x] Documents table (booking documents)
- [x] PDF / Excel export capability (api-server)
- [ ] Cloud object storage (currently local filesystem only — files won't persist across deploys)

## Admin & Back Office
✅ QA passed 2026-07-31 — RBAC + validation verified via authenticated API tests (`docs/qa/manu/admin-backoffice-{summary,findings,testing-suite,testing-report}.md`). Verdict READY WITH RESERVATIONS. Two input-validation defects found & fixed; audit-coverage gap remains open.
- [x] ~~User management (`admin/users.tsx`)~~ ✅ admin-only create/edit/deactivate/password; role now validated against enum (was `z.string()` — fixed, previously 500-leaked SQL). No delete/suspend/server-search endpoints (feature gaps).
- [x] ~~Affiliates (`admin/affiliates.tsx`)~~ ✅ admin-only create/list; Zod allowlist. No update/delete endpoint (feature gap).
- [x] ~~Reports / business intelligence (`admin/reports.tsx`)~~ ✅ analytics/stats gated to admin/super_admin/country_manager; non-privileged 403; leader reports self-scoped.
- [x] ~~Global pricing settings + markup rules (`admin/pricing-settings.tsx`)~~ ✅ markup numeric fields now validated (non-negative; was 500-leaking SQL & storing negatives — fixed); markup PATCH now validates body. [ ] Open: global settings accept arbitrary unvalidated key/value (AB-04).
- [x] ~~Audit logs for admin/staff actions (manually triggered per route, not middleware-based)~~ ✅ read admin-only; append-only (no tamper/delete endpoint). [ ] Open (High/AB-01): user, affiliate, and pricing/markup/settings writes are NOT audited — only payment/booking/hotel/tour actions are.
- [ ] Open (AB-03): `/api/user-profiles` (profile PII incl. role) readable by flight_agent & operations_manager — confirm intent or narrow to user-administering roles.

## Platform, Infra & Tooling
- [x] pnpm monorepo (api-server, tourops web, mockup-sandbox) with Orval OpenAPI codegen
- [x] BullMQ background job processing
- [x] Zod + drizzle-zod request validation (most routes)
- [x] Mockup sandbox for design prototyping (Vite + Tailwind + Radix + Framer Motion)
- [x] Prod seed strategy: secret-guarded bootstrap (dev/prod DBs separate; Publish syncs schema, not data)
- [ ] PWA (no service worker or manifest)
- [x] Automated test suite (only manual QA plan exists) — vitest functional suite now exists in `artifacts/api-server/src/tests/functional/` (9 spec files: auth, RBAC, routes)

## Known Issues / Needs Review
- [x] ~~PATCH `/api/assignments/:id` notes-only → 500 (pre-existing)~~ ✅ fixed & retested
- [!] Intermittent 401 console noise in browser logs
- [!] 3 pre-existing TypeScript errors in `tourops` `calendar.tsx`
- [!] `routes.ts` is a ~3,500-line monolith — candidate for refactor into per-domain routers
- [!] Some PATCH endpoints still pass raw `req.body` to storage (departures fixed; audit others per allowlist pattern)
- [!] Booking/workflow subroutes default to ALL_STAFF — verify parity whenever a role is restricted at the wide-read level

## Proposed Project Tasks (backlog)
- [x] ~~#4 Hide unpublished tour details from anonymous visitors~~ ✅ fixed & retested (AUTHZ-01)
- [x] ~~#10 Keep supplier catalog data out of customer accounts~~ ✅ verified (403)
- [x] ~~#12 Confirm content editors can't change tour prices or publish status~~ ✅ verified
- [x] ~~#19 Catch specific pages hidden behind catch-all URL patterns~~ ✅ tested — no API-level leak; SPA guards confirmed & hardened
- [x] ~~#21 Upgrade from gpt-4o to gpt-5~~ ✅ done & smoke-tested
