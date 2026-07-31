# Operations Dashboards (Staff Roles) — Testing Suite

_Status legend: PASS · FAIL · N/A · INFO · OPEN_

| Test ID | Category | Role | Objective | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|---|
| OD-F01 | Functional | all staff | Staff login | seed accounts | POST /api/auth/login portal=staff | 200 | PASS |
| OD-F02 | Functional | all | Role detection | logged in | GET /api/user-profile | 200 correct role | PASS |
| OD-F03 | Functional | content_editor | Content dashboard data | logged in | GET /api/tours | 200 | PASS |
| OD-F04 | Functional | transport_manager | Transport dashboard data | logged in | GET /api/transport/routes | 200 | PASS |
| OD-F05 | Functional | flight_agent | Flight workflows | logged in | GET /api/flight-agent/workflows | 200 | PASS |
| OD-F06 | Functional | tour_leader | Assigned tours/bookings | logged in | GET /api/bookings | 200, assigned only | PASS |
| OD-F07 | Functional | city_manager | City data | logged in | GET /api/master/cities | 200 | PASS |
| OD-F08 | Functional | accounting | Financial data | logged in | GET /api/payments | 200 | PASS |
| OD-F09 | Functional | support_agent | Support cases | logged in | GET /api/bookings | 200 | PASS |
| OD-R01 | RBAC | accounting | Payments allowed | — | GET /api/payments | 200 | PASS |
| OD-R02 | RBAC | support | Payments forbidden | — | GET /api/payments | 403 | PASS |
| OD-R03 | RBAC | flight_agent | Payments forbidden | — | GET /api/payments | 403 | PASS |
| OD-R04 | RBAC | content_editor | Bookings forbidden | — | GET /api/bookings | 403 | PASS |
| OD-R05 | RBAC | accounting | Tours forbidden | — | GET /api/tours | 403 | PASS |
| OD-R06 | RBAC | non-flight roles | Flight workflows forbidden | — | GET /api/flight-agent/workflows | 403 | PASS |
| OD-R07 | RBAC | non-airline roles | Airline rates forbidden | — | GET /api/rates/airline | 403 | PASS |
| OD-R08 | RBAC | city_manager | Bookings/payments forbidden | — | GET /api/bookings, /api/payments | 403 | PASS |
| OD-W01 | Wide-read | accounting/support/flight | Booking exposure | — | GET /api/bookings count | scoped per role | OPEN (OD-01) |
| OD-W02 | Wide-read | tour_leader | Booking scoping | — | GET /api/bookings count | only assigned (0) | PASS |
| OD-G01 | Generic | operations_manager | Fallback dashboard | logged in | load generic | renders, role-gated data only | PASS |
| OD-G02 | Generic | any | No privileged data on generic | — | generic API calls | only permitted 200s | PASS |
| OD-N01 | Navigation | all | Sidebar role filtering | logged in | inspect sidebar | only authorized items | PASS |
| OD-N02 | Navigation | any | Direct URL to other dashboard | logged in | open other dashboard URL | shell loads, data 403 | PASS |
| OD-A01 | AuthZ | none | Unauthenticated dashboard API | no cookie | GET /api/payments | 401 | PASS |
| OD-A02 | AuthZ | customer | Customer on staff endpoints | customer | GET /api/tours, /api/bookings | 403 | PASS |
| OD-S01 | Security | any | Privilege escalation via role param | staff | tamper role in request | server reads profile.role, ignored | PASS |
| OD-S02 | Security | any | Cross-role data exposure | staff | fetch other role's endpoint | 403 | PASS |
| OD-S03 | Security | any | Session persistence | logged in | reuse cookie | session valid | PASS |
| OD-API01 | API | staff | HTTP method validation | — | wrong method | 404/405 | PASS |
| OD-RG01 | Regression | all | Correct dashboard per role | — | route matrix | correct | PASS |
| OD-RG02 | Regression | all | Cannot access other dashboards' data | — | endpoint matrix | 403 | PASS |
| OD-RG03 | Regression | all | Generic only when no dedicated | — | fallback check | correct | PASS |
| OD-RG04 | Regression | all | Sidebar shows only authorized | — | sidebar check | correct | PASS |
