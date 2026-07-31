# Booking Engine QA — Bug Log (2026-07-31)

| ID | Feature | Severity | Status |
|----|---------|----------|--------|
| BUG-BE-01 | Booking engine | HIGH | FIXED |
| BUG-GT-01 | Join flow | HIGH | FIXED |
| BUG-GT-02 | Join flow | MEDIUM | FIXED |
| BUG-GT-03 | Join flow | LOW | FIXED |
| BUG-GT-04 | Join flow UI | MEDIUM | FIXED |
| BUG-TR-01 | Travelers UI | MEDIUM | FIXED |
| BUG-TX-01 | Translations | MEDIUM | FIXED |
| BUG-GT-05 | Join flow (bypass) | HIGH | FIXED |
| BUG-GT-06 | Join flow (share link) | HIGH | FIXED |
| NOTE-JOIN-RL | Join flow | LOW | OPEN (accepted) |

## BUG-BE-01 — Duplicate booking on rapid double-submit
- Steps: valid booking dialog → double-click Confirm Booking fast.
- Expected: one booking. Actual: two bookings created.
- Root cause: button disabled via `bookMutation.isPending`, which updates async; second click fires before re-render.
- Fix: `submittingRef` guard around all `bookMutation.mutate` call sites in customer/tour-detail.tsx, reset in `onSettled`.
- Retest: double-click created exactly one booking (BK-F021FE00). PASS.

## BUG-GT-01 — Join code of cancelled/completed group accepted
- Steps: POST /api/bookings/join with a cancelled group's code → 200 and booking created.
- Fix: 409 when original booking status ∈ {cancelled, rejected, completed}.
- Retest: 409 for both cancelled and completed codes. PASS.

## BUG-GT-02 — Duplicate join by same user
- Fix: 409 "You have already joined this group" when a live join booking for the same leader+tour exists. Retest PASS (API + UI).

## BUG-GT-03 — Leader could join own group
- Fix: 400 "You are the leader of this group". PASS.

## BUG-GT-04 — Join modal masks server errors
- Every join error showed "Invalid join code", hiding "already joined" / "group closed" / "no spots".
- Fix: my-bookings.tsx onError parses and surfaces the server message. Retest PASS.

## BUG-TR-01 — No path from booking detail to traveler edit/delete
- Edit/delete exist only on /manage-passengers; Travelers tab offered no link.
- Fix: "Manage Passengers" button added to the Travelers tab. PASS (typecheck + existing page verified earlier via API/UI).

## BUG-TX-01 — 60 duplicate translation keys after task #22 merge
- 20 `pe_*` keys duplicated in each of the 3 language dicts (TS1117 ×60; esbuild duplicate-key warnings). Later entries win at runtime, so no user-visible break, but typecheck was failing.
- Fix: removed the earlier duplicate lines; `tsc` clean (calendar.tsx pre-existing errors aside).

## BUG-GT-05 — Direct POST /api/bookings bypassed all join guards (found in code review)
- The tour-page share-link dialog posted `bookingType: "join_leader_group"` straight to POST /api/bookings, skipping group-status/self-join/duplicate checks (and leaderUserId was dropped, orphaning the participant).
- Fix: POST /api/bookings now rejects join_leader_group (400 → use /api/bookings/join); the share-link dialog calls /api/bookings/join with joinCode + partySizeExpected; the join endpoint derives leader/group/price from the resolved original booking (departure price × party size) — never client input.
- Race hardening: partial unique index `uniq_active_group_membership` on (customer_id, leader_user_id, tour_id, departure_id) for non-cancelled join bookings; 23505 → 409. Duplicate check now includes departureId so a customer can join distinct groups by the same leader.
- Retest: direct POST 400; join with partySize 2 priced at departure price ($680 × 2 = $1,360); repeat join 409. PASS.

## BUG-GT-06 — Share-link join dialog never opened for prospective joiners
- GET /api/bookings/by-code/:code returned 403 for anyone but the leader/staff, so the join dialog (which needs the group name/departure) never rendered for exactly the users it exists for.
- Fix: non-owners now receive a minimal shape (id, tourId, departureId, leader id, groupName, partySize, status) — never the leader's full booking.
- Retest (UI): dialog auto-opens on the share link, join succeeds, second attempt shows "You have already joined this group". PASS.

## NOTE-JOIN-RL — Join-code brute force (LOW, open)
- /api/bookings/join requires auth but has no per-user rate limit; 6-char uppercase alphanumeric code space makes online guessing impractical in the short term. Consider adding a limiter if abuse is a concern.
