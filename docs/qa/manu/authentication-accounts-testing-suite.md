# Authentication & Accounts — Testing Suite (Checklist)

**Date:** 2026-07-25
Status legend: ✅ Pass · ❌ Fail · N/A Not applicable/implemented

---

## Functional

| ID | Category | Objective | Preconditions | Steps | Expected | Status |
|----|----------|-----------|---------------|-------|----------|--------|
| F-01 | Functional | Happy-path admin login | admin account exists | POST /api/auth/login valid + portal=admin | 200 + user JSON | ✅ |
| F-02 | Functional | Wrong password | account exists | POST login bad password | 401 | ✅ |
| F-03 | Functional | Nonexistent user | — | POST login unknown user | 401 | ✅ |
| F-04 | Functional | Empty body | — | POST login `{}` | 400 | ✅ |
| F-05 | Functional | Missing password | — | POST login username only | 400 | ✅ |
| F-06 | Functional | Login without portal | account exists | POST login no portal | 200 | ✅ |
| F-07 | Functional | Customer self-registration | unique username | POST /api/auth/register valid | 201 + auto-login | ✅ |
| F-08 | Functional | Duplicate username | username taken | POST register same username | 409 | ✅ |
| F-09 | Functional | Logout | logged in | POST /api/auth/logout | 200 + cookie cleared | ✅ |
| F-10 | Functional | GET /api/logout redirect | logged in | GET /api/logout | 302 → / | ✅ |
| F-11 | Functional | State persistence | logged in | GET /api/auth/user with cookie | 200 | ✅ |
| F-12 | Functional | Auto profile creation | new user | GET /api/user-profile | 200 role=customer | ✅ |

## Validation

| ID | Category | Objective | Steps | Expected | Status |
|----|----------|-----------|-------|----------|--------|
| V-01 | Validation | Short username | register username<3 | 400 | ✅ |
| V-02 | Validation | Weak password | register password<6 | 400 | ✅ |
| V-03 | Validation | Invalid email format | register email="bad" | 400 | ✅ |
| V-04 | Validation | Malformed JSON | POST login `{bad` | 400 generic | ✅ |
| V-05 | Validation | Oversized body 200KB | POST login huge username | 413 | ✅ |
| V-06 | Validation | Oversized body 3MB | POST login 3MB | 413 | ✅ |

## Permission / Portal

| ID | Category | Objective | Steps | Expected | Status |
|----|----------|-----------|-------|----------|--------|
| P-01 | Permission | Customer via admin portal | login customer portal=admin | 403 | ✅ |
| P-02 | Permission | Customer via staff portal | login customer portal=staff | 403 | ✅ |
| P-03 | Permission | Admin via customer portal | login admin portal=customer | 200 | ✅ |
| P-04 | Permission | Staff via admin portal | login content_editor portal=admin | 403 | ✅ |
| P-05 | Permission | Customer list all profiles | GET /api/user-profiles as customer | 403 | ✅ |
| P-06 | Permission | Admin list profiles | GET /api/user-profiles as admin | 200 | ✅ |
| P-07 | Permission | Customer create admin user | POST /api/admin/users as customer | 403 | ✅ |

## Security

| ID | Category | Objective | Steps | Expected | Status |
|----|----------|-----------|-------|----------|--------|
| S-01 | Auth bypass | Access protected route no session | GET /api/auth/user no cookie | 401 | ✅ |
| S-02 | Privilege escalation | Customer PATCH own role→super_admin | PATCH /api/user-profiles/:id | 403, role unchanged | ✅ |
| S-03 | Mass assignment | Role injection via register body | register role=super_admin | ignored → customer | ✅ |
| S-04 | IDOR | Customer PATCH another profile | PATCH /api/user-profiles/other | 403 | ✅ |
| S-05 | CSRF | Cross-origin mutating request | PATCH with Origin: evil | 403 | ✅ |
| S-06 | SQL injection | Injection in username | login `x' OR 1=1--` | 401/400, no 500 | ✅ |
| S-07 | Enumeration | Uniform error messages | bad user vs bad pass | identical message | ✅ |
| S-08 | Info disclosure | Password hash leak | GET /api/auth/user | hash stripped | ✅ |
| S-09 | Brute force | Rate limiting | 11+ failed logins | 429 after 10 | ✅ |
| S-10 | Session | Logout invalidates session | reuse cookie post-logout | 401 | ✅ |
| S-11 | Session fixation | Anon session persistence | unauth request Set-Cookie | none issued | ✅ |
| S-12 | Session fixation | ID regeneration on login | login twice, compare sid | sid rotates | ✅ (AUTH-02 fixed) |
| S-16 | Validation | Password policy min length | register 7-char pw | 400 | ✅ (AUTH-06 fixed) |
| S-17 | Brute force | Per-account lockout | 5 wrong pw for one account | 429 on 6th, other accounts OK | ✅ (AUTH-07 fixed) |
| S-13 | Lifecycle | Deactivated account login | deactivate then login | denied 403 | ✅ (AUTH-01 fixed) |
| S-14 | Bootstrap abuse | seed-demo without secret | POST /api/auth/seed-demo | 403/404/409 | ✅ |
| S-15 | Cookie security | httpOnly/SameSite/Partitioned | inspect Set-Cookie | attributes present | ✅ |

## API / Method

| ID | Category | Objective | Steps | Expected | Status |
|----|----------|-----------|-------|----------|--------|
| A-01 | API | Unexpected method | GET /api/auth/login | 404 | ✅ |
| A-02 | API | Response consistency | error shapes | JSON `{message}` | ✅ |

## Not Implemented (scope gaps — documented as findings)

| ID | Category | Objective | Status |
|----|----------|-----------|--------|
| N-01 | Password reset | Reset flow exists | N/A (AUTH-03) |
| N-02 | Forgot password | Forgot flow exists | N/A (AUTH-03) |
| N-03 | 2FA | TOTP challenge | N/A (AUTH-04) |
| N-04 | Email verification | Verify email ownership | N/A (AUTH-05) |
