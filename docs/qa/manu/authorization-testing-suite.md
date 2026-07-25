# Authorization, Roles & Access Control — Testing Suite

**Date:** 2026-07-25
**Environment:** `http://localhost:80` (API server). Demo accounts: username = role without
underscores + `1` (e.g. `contenteditor1`, `countrymanager1`), password `password123`.
Portals: `admin` / `staff` / `customer`.

Status legend: Pass / Fail / Blocked / N/A.

---

## 1. Functional Tests

| Test ID | Category | Feature | Role | Objective | Preconditions | Test Steps | Expected Result | Status |
|---------|----------|---------|------|-----------|---------------|------------|-----------------|--------|
| FN-01 | Functional | Login/portal | super_admin | Admin portal login works | Seeded | POST /api/auth/login portal=admin | 200 + session | Pass |
| FN-02 | Functional | Login/portal | customer | Customer portal login | Seeded | POST /api/auth/login portal=customer | 200 + session | Pass |
| FN-03 | Functional | Dashboard routing | each role | Role lands on correct dashboard | Logged in | Load app | Role-specific dashboard | Pass |
| FN-04 | Functional | Sidebar visibility | content_editor | Only permitted nav shown | Logged in | Inspect sidebar | No admin/master items | Pass |
| FN-05 | Functional | Public browse | anonymous | Published tours listed | — | GET /api/tours/public | 200, only published | Pass |

## 2. Authorization / Role Matrix (vertical)

| Test ID | Role | Endpoint | Objective | Expected | Status |
|---------|------|----------|-----------|----------|--------|
| AZ-01 | customer | GET /api/tours | Staff list blocked | 403 | Pass |
| AZ-02 | customer | GET /api/user-profiles | Directory blocked | 403 | Pass |
| AZ-03 | customer | POST /api/tours | Create blocked | 403 | Pass |
| AZ-04 | content_editor | POST /api/tours | Builder-only create | 403 | Pass |
| AZ-05 | content_editor | POST /api/departures | Admin-only | 403 | Pass |
| AZ-06 | tour_builder | POST /api/departures | Admin-only | 403 | Pass |
| AZ-07 | airline_supplier | POST /api/master/countries | Admin-only | 403 | Pass |
| AZ-08 | hotel_manager | POST /api/master/countries/import | Admin-only | 403 | Pass |
| AZ-09 | country_manager | GET /api/master/countries | Staff read allowed | 200 | Pass |
| AZ-10 | country_manager | POST /api/master/countries | Admin-only create | 403 | Pass |
| AZ-11 | accounting | GET /api/tours | Not wide-read | 403 | Pass |
| AZ-12 | support_agent | GET /api/user-profiles | Not wide-read | 403 | Pass |
| AZ-13 | airline_supplier | GET /api/hotels | External supplier blocked | 403 | Pass |

## 3. Permission Matrix (write capability by role — representative)

| Resource | super_admin/admin | tour_builder | content_editor | country_manager | hotel_manager | supplier | customer |
|----------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Create tour | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit tour content | ✅ | ✅ | ✅ (content only) | ❌ | ❌ | ❌ | ❌ |
| Edit tour price/publish | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create/edit departures | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create country (master) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit assigned country | ✅ | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ❌ |
| Manage own hotels | ✅ | ❌ | ❌ | ✅ | ✅ (own) | ❌ | ❌ |
| Approve hotel | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## 4. Field-Level Security

| Test ID | Role | Resource | Objective | Test Steps | Expected | Status |
|---------|------|----------|-----------|------------|----------|--------|
| FL-01 | content_editor | Tour | Cannot change basePrice | PATCH tour basePrice=99999 | basePrice unchanged | Pass |
| FL-02 | content_editor | Tour | Cannot change isPublished | PATCH tour isPublished=false | stays published | Pass |
| FL-03 | content_editor | Tour | Can change description | PATCH tour description | description updated | Pass |
| FL-04 | tour_builder | Tour | Can change structure/pricing | PATCH basePrice | updated | Pass |
| FL-05 | admin | Departure | capacityBooked not client-mutable | PATCH capacityBooked | ignored (allowlist) | Pass |
| FL-06 | admin | Departure | tourId/audit fields immutable | PATCH tourId | ignored | Pass |

## 5. Row-Level Security

| Test ID | Role | Objective | Test Steps | Expected | Status |
|---------|------|-----------|------------|----------|--------|
| RL-01 | supplier | Own workflows only | GET /api/supplier/workflows | scoped list | Pass |
| RL-02 | supplier | No IDOR on booking | GET /api/supplier/bookings/<foreign> | 403/404 | Pass |
| RL-03 | hotel_manager | Own hotels (createdBy) | GET /api/hotels | own rows | Pass |
| RL-04 | hotel_manager | Cannot approve own hotel | PATCH /api/hotels/:id/approve | 403 | Pass |
| RL-05 | country_manager | Directory scoped to country | GET /api/user-profiles | own-country rows | Pass |
| RL-06 | country_manager | PATCH only assigned country | PATCH other country | 403 | Pass |
| RL-07 | city_manager | PATCH only assigned city | PATCH other city | 403 | Pass |

## 6. API Authorization / IDOR / Escalation

| Test ID | Objective | Test Steps | Expected | Status |
|---------|-----------|------------|----------|--------|
| API-01 | Missing auth | anon POST /api/tours | 401 | Pass |
| API-02 | Missing auth | anon GET /api/user-profiles | 401 | Pass |
| API-03 | Forced browsing | anon GET /api/admin/users | 401/404 | Pass |
| API-04 | Vertical escalation | customer → staff routes | 403 | Pass |
| API-05 | Horizontal escalation | supplier → foreign booking | 404 | Pass |
| API-06 | Mass assignment (tour) | content_editor sends STRUCTURE fields | fields ignored | Pass |
| API-07 | Mass assignment (departure) | client sends createdBy/capacityBooked | ignored | Pass |
| API-08 | HTTP method bypass | PATCH/PUT on gated route as low role | 403 | Pass |

## 7. Regression / Hidden-resource Tests

| Test ID | Objective | Expected | Status |
|---------|-----------|----------|--------|
| RG-01 | `/api/master/*/import` enforce requireRole | 403 for low roles | Pass |
| RG-02 | Supplier catalog not exposed to customer (task #10) | 403 | Pass |
| RG-03 | Content editor cannot change price/publish (task #12) | blocked | Pass |
| RG-04 | Anonymous unpublished tour access (task #4) | 404/403 | ~~Fail~~ → **Pass (AUTHZ-01 fixed)** |
| RG-05 | Catch-all URL pages hidden (task #19) | no API leak | Pass |

## 8. Security / Edge Cases

| Test ID | Objective | Expected | Status |
|---------|-----------|----------|--------|
| SEC-01 | Anonymous unpublished tour detail by ID | denied | ~~Fail~~ → **Pass (AUTHZ-01 fixed)** |
| SEC-02 | Anonymous unpublished tour departures | denied | ~~Fail~~ → **Pass (AUTHZ-01 fixed)** |
| SEC-03 | Frontend-only restriction bypass (direct API) | backend enforces | Pass |
| SEC-04 | Customer access to supplier catalog | 403 | Pass |
| SEC-05 | Parameter tampering (role in body) | ignored — role from profile | Pass |
| SEC-06 | Profile default least-privilege | defaults to customer | Pass (see AUTHZ-02) |
