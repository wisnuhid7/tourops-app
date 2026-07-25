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
- [ ] Password reset / forgot password
- [ ] Two-factor authentication
- [ ] Email verification
- [!] `getOrCreateProfile` auto-creates a "customer" profile for any user without one — can mask missing staff setup

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
- [~] Task #19: catch specific pages hidden behind catch-all URL patterns — no API-level leak found; confirm SPA route guards client-side

## Tours & Itinerary
- [x] Tour CRUD (tours, tour_days, tour_day_items) with publish status
- [x] AI tour/itinerary generator (`admin/tour-generator.tsx`, gpt-4o backend)
  - [~] Hardcoded fallback itinerary generator when OpenAI unavailable
- [x] Tour detail page (public + customer views) with itinerary, hotels, guides
- [x] "Starting From" pricing (lowest open-departure price, base-price fallback)
- [x] Child pricing (proportional to departure adult price, capped at adult price)
- [x] Tour brochure page (`customer/tour-brochure.tsx`)
- [x] Browse tours with search, category, duration, price slider, date-range filters

## Departures
- [x] Departure CRUD (`/admin/departures`): create, edit (dates/capacity/price/status/public-join), delete
- [x] Delete protection — 409 when bookings are linked to a departure
- [x] Server-side PATCH field allowlist (tourId / capacityBooked not client-mutable)
- [x] Departure statuses (open / closed / sold_out / cancelled) + public-join toggle
- [x] Promo departure pricing (departure price may be below tour base price)

## Bookings & Group Travel
- [x] Booking engine: private and group tours
- [x] Join-group flow via invitation/join codes (uses departure price)
- [x] Traveler/passenger management (`manage-passengers.tsx`, travelers table)
- [x] Group-leader features (`leader-dashboard.tsx`, `leader-payments.tsx`)
- [x] Customer post-booking: `my-bookings.tsx`, `booking-detail.tsx`
- [x] Admin order management (`admin/bookings.tsx`, `admin/booking-detail.tsx`)
- [x] Multi-step service workflow system per booking (Airline, Hotel, Transport, Guide, Sights steps)
  - [~] `admin/workflow-detail.tsx` — complex multi-step UI, partially polished
- [x] Booking assignments (staff/resource allocation, `admin/assignments.tsx`)
  - [!] Known bug: PATCH `/api/assignments/:id` with notes-only body → 500

## Payments
- [~] Payments table + admin payments page (`admin/payments.tsx`) — internal record-keeping
- [x] Payment status email notification (`sendPaymentStatusNotification`)
- [ ] Stripe / external payment gateway integration (no SDK present)
- [ ] Online checkout for customers
- [ ] Refund management

## Suppliers & Supply Chain
- [x] Supplier portals: airline_supplier, hotel_manager, guide_manager, sights_manager
- [x] Hotel, sight, transport-company, airline-agency catalog management
- [x] Rate cards (`admin/rate-cards.tsx`) — note: numeric price columns expect strings in insert schema
- [~] Airline flight search/pricing — simulated prices (distance/seasonality), not a real GDS
- [~] `supplier/airline-search.tsx` — partially integrated (redirects into supplier tab)
- [x] Transport module (bus types, transport routes) — accessible at both `/admin/transport` and `/ops/transport` (duplicate route)

## Ops Dashboards (staff roles)
- [x] Content editor (`ops/content-editor.tsx`)
- [x] Transport manager (`ops/transport-dashboard.tsx`)
- [x] Flight agent (`ops/flight-agent.tsx`)
- [x] Tour leader (`ops/tour-leader.tsx`)
- [x] City manager (`ops/city-manager.tsx`)
- [x] Accounting (`ops/accounting.tsx`)
- [x] Support agent (`ops/support.tsx`)
- [~] Generic fallback dashboard (`ops/generic-dashboard.tsx`) for roles without a dedicated view

## Master Data
- [x] Countries, cities, airports, sights, hotels management (`admin/master-data.tsx`)
- [x] Master record import endpoints (cities, etc.)
  - [x] ~~Import routes now enforce explicit `requireRole` checks~~ ✅ tested (RG-01)
- [~] Data scrapers (country/city/sight/hotel ingestion) — simulated logic, no real external fetches
- [~] Price intelligence tables (`hotel_price_snapshots`, `flight_price_snapshots`) — schema exists, fed by simulated services

## AI & Intelligence
- [x] OpenAI gpt-4o via Replit AI integration (itineraries, translation, sight enrichment, business analytics)
- [x] Lazy background entity translation (ES/ID) for hotels, guides, tour day items (`translations` jsonb + completeness verification, chunked batches)
- [x] Public-safe translation shaping (`pickPublicTranslations` — never leaks internal notes/policies)
- [x] AI generation job tracking (`ai_generation_jobs` table)
- [ ] Upgrade gpt-4o → gpt-5 (proposed task #21)

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
- [x] User management (`admin/users.tsx`)
- [x] Affiliates (`admin/affiliates.tsx`)
- [x] Reports / business intelligence (`admin/reports.tsx`)
- [x] Global pricing settings + markup rules (`admin/pricing-settings.tsx`)
- [x] Audit logs for admin/staff actions (manually triggered per route, not middleware-based)

## Platform, Infra & Tooling
- [x] pnpm monorepo (api-server, tourops web, mockup-sandbox) with Orval OpenAPI codegen
- [x] BullMQ background job processing
- [x] Zod + drizzle-zod request validation (most routes)
- [x] Mockup sandbox for design prototyping (Vite + Tailwind + Radix + Framer Motion)
- [x] Prod seed strategy: secret-guarded bootstrap (dev/prod DBs separate; Publish syncs schema, not data)
- [ ] PWA (no service worker or manifest)
- [ ] Automated test suite (only manual QA plan exists)

## Known Issues / Needs Review
- [!] PATCH `/api/assignments/:id` notes-only → 500 (pre-existing)
- [!] Intermittent 401 console noise in browser logs
- [!] 3 pre-existing TypeScript errors in `tourops` `calendar.tsx`
- [!] `routes.ts` is a ~3,500-line monolith — candidate for refactor into per-domain routers
- [!] Some PATCH endpoints still pass raw `req.body` to storage (departures fixed; audit others per allowlist pattern)
- [!] Booking/workflow subroutes default to ALL_STAFF — verify parity whenever a role is restricted at the wide-read level

## Proposed Project Tasks (backlog)
- [x] ~~#4 Hide unpublished tour details from anonymous visitors~~ ✅ fixed & retested (AUTHZ-01)
- [x] ~~#10 Keep supplier catalog data out of customer accounts~~ ✅ verified (403)
- [x] ~~#12 Confirm content editors can't change tour prices or publish status~~ ✅ verified
- [~] #19 Catch specific pages hidden behind catch-all URL patterns — no API-level leak; confirm SPA guards
- [ ] #21 Upgrade from gpt-4o to gpt-5
