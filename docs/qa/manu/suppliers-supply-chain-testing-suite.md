# Suppliers & Supply Chain — Testing Suite

_Status legend: PASS · FAIL · FIXED · N/A · BY-DESIGN_

| Test ID | Category | Objective | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| SSC-F01 | Functional | Hotel catalog GET | hotel_manager logged in | GET /api/hotels | 200, only own rows | PASS |
| SSC-F02 | Functional | Sights catalog CRUD read | sights_manager | GET /api/master/sights | 200 list | PASS |
| SSC-F03 | Functional | Transport company read | transport_manager | GET /api/master/transport-companies | 200 | PASS |
| SSC-F04 | Functional | Airline agency read | airline_supplier | GET /api/master/airline-agencies | 200 | PASS |
| SSC-F05 | Functional | Rate card create (valid) | guide_manager | POST /api/rates/guide price="150.50" | 200 stored | PASS |
| SSC-F06 | Functional | Rate card create (null price) | guide_manager | POST no price | 200 | PASS |
| SSC-P01 | Portal | Staff login (staff portal) | seed accounts | POST /api/auth/login portal=staff | 200 | PASS |
| SSC-P02 | Portal | Cross-portal: staff via customer | hotel_manager | login portal=customer | 403 | PASS |
| SSC-P03 | Portal | Cross-portal: customer via staff | customer1 | login portal=staff | 403 | PASS |
| SSC-P04 | Portal | Cross-portal: customer via admin | customer1 | login portal=admin | 403 | PASS |
| SSC-C01 | Catalog | Customer cannot read hotels | customer | GET /api/hotels | 403 | PASS |
| SSC-C02 | Catalog | Customer cannot read master catalogs | customer | GET /api/master/* | 403 | PASS |
| SSC-C03 | Catalog | Ownership: hotel_manager sees only own | hotel_manager | GET /api/hotels | own rows only | PASS |
| SSC-R01 | RateCard | Numeric string accepted | guide_manager | price="150.50" | 200 | PASS |
| SSC-R02 | RateCard | Invalid price rejected | guide_manager | price="abc" | 400, no SQL leak | FIXED |
| SSC-R03 | RateCard | Negative price rejected | guide_manager | price="-5" | 400 | FIXED |
| SSC-R04 | RateCard | Cross-supplier rate isolation | hotel_manager | GET /api/rates/guide | 403 | PASS |
| SSC-R05 | RateCard | Rate role matrix | all rate roles | GET each /api/rates/* | only own type 200 | PASS |
| SSC-A01 | Airline | Flight search role gating | flight_agent | GET /api/flights/search | 200 | PASS |
| SSC-A02 | Airline | Unauthorized flight search | transport_manager | GET /api/flights/search | 403 | PASS |
| SSC-A03 | Airline | Missing params validation | flight_agent | GET without date | 400 | PASS |
| SSC-A04 | Airline | Pricing consistency (same input) | flight_agent | 2× identical search | identical price | BY-DESIGN (varies, F-02) |
| SSC-A05 | Airline | Customer cannot search flights | customer | GET /api/flights/search | 403 | PASS |
| SSC-T01 | Transport | Bus-type read gating | matrix | GET /api/transport/bus-types | staff-scoped, cust 403 | PASS |
| SSC-T02 | Transport | Route read gating | matrix | GET /api/transport/routes | scoped | PASS |
| SSC-T03 | Transport | /admin vs /ops parity | — | both hit /api/transport/* | identical authz | PASS |
| SSC-T04 | Transport | Customer POST route | customer | POST /api/transport/routes | 403 | PASS |
| SSC-T05 | Transport | content_editor POST bus-type | content_editor | POST /api/transport/bus-types | 403 | PASS |
| SSC-T06 | Transport | support GET transport payments | support_agent | GET /api/transport/payments | 403 | PASS |
| SSC-S01 | Security | Mass-assignment: content_editor tour price/publish | content_editor | PATCH /api/tours/:id basePrice+isPublished | stripped (no change) | PASS (500 noise, F-03) |
| SSC-S02 | Security | Info disclosure on invalid input | guide_manager | POST invalid price | no SQL in body | FIXED |
| SSC-S03 | Security | IDOR: catalog PATCH cross-owner | hotel_manager | PATCH other's hotel | owner-checked | PASS |
| SSC-S04 | Security | Direct API access without auth | none | GET /api/hotels no cookie | 401 | PASS |
| SSC-S05 | Security | SQL injection in rate fields | guide_manager | price with `';DROP` | parameterized, rejected as non-numeric | PASS/FIXED |
| SSC-API01 | API | HTTP method validation | staff | wrong method on rate route | 404/405 | PASS |
| SSC-API02 | API | Duplicate submission | guide_manager | POST same rate twice | both create (no unique) — Info | INFO |
| SSC-RG01 | Regression | Suppliers expose only authorized resources | all supplier roles | GET matrix | correct 200/403 | PASS |
| SSC-RG02 | Regression | Ownership restrictions enforced | own_only roles | read/write scoping | enforced | PASS |
| SSC-RG03 | Regression | Numeric string rate fields | rate roles | valid/invalid inputs | valid ok, invalid 400 | FIXED |
| SSC-RG04 | Regression | Transport dup-route authz identical | — | /admin vs /ops | identical | PASS |
