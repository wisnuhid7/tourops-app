# Admin & Back Office — Testing Suite

_Status legend: PASS · FAIL · FIXED · OPEN · N/A_

| Test ID | Category | Objective | Preconditions | Test Steps | Expected Result | Status |
|---|---|---|---|---|---|---|
| AB-U01 | User mgmt | List users as admin | superadmin session | GET /api/user-profiles | 200 list | PASS |
| AB-U02 | User mgmt | Create user (allowlist) | admin | POST /api/admin/users valid | 200, hashed pw | PASS |
| AB-U03 | User mgmt | Duplicate username | admin | POST create existing username | 409 | PASS |
| AB-U04 | User mgmt | Edit profile fields | admin | PATCH /api/user-profiles/:id | 200 | PASS |
| AB-U05 | User mgmt | Deactivate account | admin | PATCH isActive=false | 200 | PASS |
| AB-U06 | User mgmt | Password reset allowlist | admin | PATCH .../password {password} | 200 | PASS |
| AB-U07 | Validation | Invalid role string | admin | PATCH role="not_a_real_role" | 400, no SQL leak | FIXED |
| AB-U08 | Validation | Valid enum role | admin | PATCH role="customer" | 200 | PASS |
| AB-U09 | Security | Mass assignment on PATCH | admin | PATCH with extra fields | stripped by allowlist | PASS |
| AB-U10 | RBAC | Non-admin edit profile | content_editor | PATCH /api/user-profiles/:id | 403 | PASS |
| AB-U11 | RBAC | Non-admin create user | content_editor | POST /api/admin/users | 403 | PASS |
| AB-U12 | Feature gap | User delete/suspend | admin | search for endpoint | none exists | OPEN |
| AB-A01 | Affiliate | List affiliates | admin | GET /api/admin/affiliates | 200 | PASS |
| AB-A02 | Affiliate | Create affiliate | admin | POST valid | 200 | PASS |
| AB-A03 | Affiliate | Create as non-admin | content_editor | POST | 403 | PASS |
| AB-A04 | Affiliate | Invalid affiliate data | admin | POST bad body | 400 | PASS |
| AB-A05 | Affiliate | Audit on create | admin | create then GET audit-logs | entry present | OPEN (AB-01) |
| AB-A06 | Feature gap | Affiliate update/delete | admin | search endpoint | none exists | OPEN |
| AB-R01 | Reports | Analytics as admin | admin | GET /api/admin/analytics | 200 | PASS |
| AB-R02 | Reports | Stats as admin | admin | GET /api/admin/stats | 200 | PASS |
| AB-R03 | Reports | Analytics as country_manager | country_manager | GET /api/admin/analytics | 200 (intended) | PASS |
| AB-R04 | RBAC | Reports as non-privileged | accounting/support/customer | GET analytics/stats | 403 | PASS |
| AB-R05 | Reports | Leader report self-scope | tour_leader | GET /api/leader/dashboard | 200, own data only | PASS |
| AB-P01 | Pricing | List markup rules | admin | GET markup-rules | 200 | PASS |
| AB-P02 | Pricing | Create markup rule | admin | POST valid | 200 | PASS |
| AB-P03 | Validation | Non-numeric markup | admin | POST markupPercentage="abc" | 400, no SQL leak | FIXED |
| AB-P04 | Validation | Negative markup | admin | POST markupPercentage="-50" | 400 (not stored) | FIXED |
| AB-P05 | Security | Markup PATCH raw body | admin | PATCH extra fields | validated by partial schema | FIXED |
| AB-P06 | RBAC | Markup write as non-admin | content_editor | POST markup-rules | 403 | PASS |
| AB-P07 | Pricing | Settings write as admin | admin | POST settings | 200 | PASS |
| AB-P08 | Pricing | Settings arbitrary key | country_manager | POST {key:"qa_probe_key"} | stored (no validation) | OPEN (AB-04) |
| AB-P09 | Pricing | Engine rejects negative quote | admin | POST /api/pricing/quotes negative | 400 | PASS |
| AB-P10 | Pricing | Markup precedence | — | review lib/pricing.ts | deterministic order | PASS |
| AB-AU01 | Audit | Read audit logs as admin | admin | GET /api/admin/audit-logs | 200 | PASS |
| AB-AU02 | Audit | Read audit logs as non-admin | accounting | GET /api/admin/audit-logs | 403 | PASS |
| AB-AU03 | Audit | Read audit logs unauth | none | GET /api/admin/audit-logs | 401 | PASS |
| AB-AU04 | Audit | Coverage: user/affiliate/pricing | admin | inspect entityTypes | MISSING these types | OPEN (AB-01) |
| AB-AU05 | Audit | Tamper/delete audit log | admin | search for PUT/DELETE endpoint | none exists (append-only) | PASS |
| AB-AU06 | Audit | Coverage: payment/booking/tour | admin | inspect entityTypes | present | PASS |
| AB-S01 | Security | Privilege escalation via body role | staff | tamper role field | server uses profile.role | PASS |
| AB-S02 | Security | IDOR on profile PATCH | non-admin | PATCH other user | 403 | PASS |
| AB-S03 | Security | Direct API access unauth | none | GET admin endpoints | 401 | PASS |
| AB-S04 | Security | Info disclosure on bad input | admin | trigger DB error | 400 (post-fix) | FIXED |
| AB-S05 | Security | PII exposure via wide-read | flight_agent/ops_manager | GET /api/user-profiles | 200 (over-exposed) | OPEN (AB-03) |
| AB-API01 | API | HTTP method validation | admin | wrong method | 404/405 | PASS |
| AB-API02 | API | Invalid identifiers | admin | PATCH nonexistent id | 404/handled | PASS |
| AB-RG01 | Regression | Admin-only user mgmt enforced | all roles | endpoint matrix | correct | PASS |
| AB-RG02 | Regression | Pricing calc correct after config | — | review engine | consistent | PASS |
| AB-RG03 | Regression | Audit logs immutable | admin | no mutate endpoint | correct | PASS |
