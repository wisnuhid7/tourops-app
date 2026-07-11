# TourOps - B2C Tour Booking & Operations Platform

## Overview
A comprehensive tour booking platform supporting multiple booking modes (leader groups, public groups, private family, custom itineraries), role-based access control, and end-to-end fulfillment workflows across five service types (airline, hotel, transport, guide, sights).

## Tech Stack
- **Frontend**: React + Vite, Wouter routing, TanStack Query, shadcn/ui, Tailwind CSS
- **Backend**: Express.js, Drizzle ORM, PostgreSQL (Neon)
- **Auth**: Custom username/password auth with bcrypt + express-session (PostgreSQL session store)
- **Theme**: Light/dark mode with ThemeProvider

## Project Structure
```
client/src/
  App.tsx              - Main routing, auth-aware layout with sidebar
  components/
    app-sidebar.tsx    - Role-based navigation sidebar
    theme-provider.tsx - Light/dark theme context
    theme-toggle.tsx   - Theme toggle button
    ui/                - shadcn components
  hooks/
    use-auth.ts        - Auth hook (session-based)
  lib/
    constants.ts       - Booking types, statuses, service workflow steps
    queryClient.ts     - TanStack Query setup
  pages/
    landing.tsx        - Public landing page
    admin/             - Admin portal (dashboard, tours, departures, bookings, users, master-data)
    customer/          - Customer portal (browse tours, tour detail, my bookings, leader dashboard, booking detail with 6 tabs)
    supplier/          - Airline supplier dashboard
    ops/               - Operations manager dashboard

server/
  index.ts             - Express server setup
  routes.ts            - All API routes
  storage.ts           - Database storage interface (PostgreSQL)
  db.ts                - Drizzle database connection
  replit_integrations/auth/ - Custom auth (session, login/logout, storage)

shared/
  schema.ts            - Drizzle schema (all tables)
  models/auth.ts       - Auth tables (users, sessions)
```

## User Roles
- **admin**: Full access to all features
- **customer**: Browse tours, book, manage travelers, view status
- **airline_supplier**: See assigned airline workflows only
- **country_manager/hotel_manager/transport_manager/guide_manager/sights_manager**: See assigned ops tasks

## Booking Flow
1. Customer browses published tours, picks a departure
2. Creates booking (public join, leader group with join code, or private family)
3. Admin confirms booking, assigns services to suppliers/ops managers
4. Each assignment creates a workflow with predefined steps
5. Suppliers/ops update workflow progress
6. Customer sees fulfillment status updates

## Database Tables
user_profiles, tours, tour_days, tour_departures, bookings, travelers,
booking_assignments, booking_workflows, workflow_steps, documents, messages, payments,
countries, cities, airports, sights, transport_companies, airline_agencies,
bus_types, transport_routes, transport_route_pricing, transport_bookings, transport_invoices, transport_payments,
hotel_rates, transport_rates, guide_rates, sights_rates

## Transportation Management System
- **Admin**: Full 6-tab interface at `/admin/transport` (Companies, Bus Types, Routes, Pricing, Bookings, Invoices & Payments)
- **Transport Manager**: Scoped 5-tab portal at `/ops/transport` (Company Profile, Bus Types, Routes & Pricing, Bookings, Invoices)
- **Security**: All transport APIs use `getTransportScope()` helper for role + company ownership checks
- **Tables**: bus_types (linked to companies), transport_routes (from/to cities), transport_route_pricing (per bus type per route), transport_bookings (tour assignments), transport_invoices, transport_payments
- **User linking**: transport_manager users linked via `user_profiles.transportCompanyId`

## Rate Cards System
- **Admin page**: `/admin/rate-cards` with 4 tabs (Hotel, Transport, Guide, Sights)
- **Features**: Manual add/edit, bulk upload via Excel (.xlsx), status management (draft→active→archived)
- **Bulk Upload**: Client-side Excel parsing with xlsx library, maps headers to fields, sends JSON to /api/rates/<type>/bulk
- **Tables**: hotel_rates, transport_rates, guide_rates, sights_rates (all with rate_status enum: draft/active/archived)
- **Roles**: admin and country_manager can manage rates
- **API**: /api/rates/hotel, /api/rates/transport, /api/rates/guide, /api/rates/sights (GET/POST/PATCH/DELETE + POST /bulk)

## Authentication
- **Login portals**: `/login` (customer, embedded in landing page), `/admin/login`, `/staff/login`
- **Default admin**: username=admin, password=admin123 (seeded on startup if no admin exists)
- **Session**: express-session with PostgreSQL store, 7-day TTL
- **Auth endpoints**: POST `/api/auth/login`, GET `/api/auth/user`, POST `/api/auth/logout`
- **Admin user mgmt**: POST `/api/admin/users` (create), PATCH `/api/admin/users/:id/password` (reset)

## Key API Routes
- `/api/tours/public` - Public tour listing
- `/api/tours/:id` - Tour detail
- `/api/bookings` - All bookings (admin)
- `/api/my-bookings` - Customer's bookings
- `/api/bookings/:id/assignments` - Service assignments
- `/api/bookings/:id/workflows` - Fulfillment workflows
- `/api/bookings/:id/messages` - Booking messages
- `/api/leader/dashboard` - Leader dashboard data (bookings + alerts)
- `/api/my-bookings/:id/documents` - Customer document upload/list
- `/api/my-bookings/:id/payments` - Customer payment list
- `/api/my-bookings/:id/participants` - Leader group participants
- `/api/my-bookings/:id/participants/:pid/cancel` - Remove participant
- `/api/my-travelers/:id` (PATCH/DELETE) - Customer-scoped traveler edit/delete with ownership check
- `/api/supplier/workflows` - Supplier assigned workflows
- `/api/ops/workflows` - Ops assigned workflows
- `/api/master/countries` - Countries CRUD + import
- `/api/master/cities` - Cities CRUD + import
- `/api/master/airports` - Airports CRUD + import
- `/api/master/sights` - Sights/Attractions CRUD + import
- `/api/master/transport-companies` - Transport Companies CRUD + import
- `/api/master/airline-agencies` - Airline Agencies CRUD + import
- `/api/transport/bus-types` - Bus Types CRUD (scoped by company)
- `/api/transport/routes` - Transport Routes CRUD (scoped by company)
- `/api/transport/route-pricing` - Route Pricing CRUD (scoped by route)
- `/api/transport/bookings` - Transport Bookings CRUD (scoped by company)
- `/api/transport/invoices` - Transport Invoices CRUD (scoped by company)
- `/api/transport/payments` - Transport Payments (admin-only create/update)
