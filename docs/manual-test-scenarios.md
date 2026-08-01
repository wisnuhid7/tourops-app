# TourOps — Manual Test Scenarios

Guide for a human tester. Test in a normal browser at the app preview URL.
All seeded accounts use password **password123**.

**Test accounts**
| Role | Username |
|---|---|
| Super admin | superadmin1 |
| Operations manager | operationsmanager1 |
| Accounting / finance | accounting1 |
| Support agent | supportagent1 |
| Tour leader | tourleader1 |
| Customer | customer1 |
| Supplier | (any seeded supplier account) |

**Seeded test tour:** "Faith & Leisure Tour" (Dominican Republic), $950/person, 3 departures (Oct 20 / Nov 10 / Dec 15, 2026), capacity 35 each.

---

## 1. Authentication & Accounts
1.1 Log in with a valid username/password → lands on the correct dashboard for that role.
1.2 Log in with a wrong password → clear error, no hint about which field was wrong.
1.3 Log out → protected pages redirect back to login.
1.4 Try opening a staff-only URL (e.g. ops dashboard) while logged in as a customer → blocked, no data visible.
1.5 Refresh the page mid-session → stays logged in.

## 2. Public Site & Tour Catalog
2.1 As a logged-out visitor, browse the tour list → only published tours appear.
2.2 Open a published tour → itinerary days, prices, and departures display correctly.
2.3 Try to open an unpublished tour by direct URL → not found (no details leak).
2.4 Switch languages (EN / ES / ID) → all visible text translates; no raw keys like `lc_...` appear anywhere.

## 3. Customer Booking Flow
3.1 As customer1, book the DR tour for a group (e.g. 20 passengers) → total price is passengers × $950 (20 → $19,000); booking appears in "My bookings" as *submitted*.
3.2 Departure seat count decreases by the booked party size.
3.3 Try booking more passengers than remaining seats → rejected with a clear message.
3.4 Open a booking belonging to a different customer by URL → not found / blocked.

## 4. Travelers & Passenger Invitations
4.1 As the booking customer, add travelers (single and bulk) up to the party size → they list correctly.
4.2 Enter traveler details: email, phone, dietary/mobility notes, emergency contact, rooming preference.
4.3 Send an invitation to a traveler with an email → invitation shows as *invited*.
4.4 Open the invite link in a private/incognito window → shows trip preview without login.
4.5 Accept the invitation, set a password → new account is created and logged in.
4.6 Try to reuse the same invite link → rejected (single use).
4.7 Try inviting a traveler whose email already belongs to an existing account → clear conflict error, no account takeover.
4.8 Completion badges on the passenger management page reflect who is invited / activated / complete, and what is missing.

## 5. Passenger Portal
5.1 As the accepted passenger, open the portal → sees own trip summary, dates, and itinerary — **no prices, no other passengers' personal data**.
5.2 Update own profile (phone, dietary notes, emergency contact) → saves and persists after refresh.
5.3 Try to edit fields that should be locked (e.g. name of another traveler, booking data) → not possible.
5.4 Accept terms & conditions → recorded; completion status flips to complete once all required fields are filled.

## 6. Payments
6.1 As customer1, record a deposit payment (30% — e.g. $5,700 on $19,000) → shows as *pending*.
6.2 As accounting1, mark the payment *paid* → customer sees updated status; balance remaining is correct.
6.3 As a non-finance staff member (e.g. supportagent1), try to mark a payment paid → blocked.
6.4 Record two payments quickly / in two tabs → no duplicates, totals stay correct.

## 7. Booking Status Workflow (Ops)
7.1 As operationsmanager1, open Booking Operations for the booking → current status and only the **valid** next statuses are offered (submitted→confirmed/cancelled; confirmed→in_operation/cancelled; in_operation→completed/cancelled).
7.2 Move the booking submitted → confirmed → in_operation → completed; each change appears in the status history with who/when/reason.
7.3 Confirm invalid jumps (e.g. confirmed → completed directly) are not offered and are rejected if forced.
7.4 Cancel a booking → departure seats are released back.

## 8. Rooming
8.1 Create rooms (e.g. double capacity 2, single capacity 1) → listed with occupancy.
8.2 Assign travelers to rooms; assign a traveler already in a room to another → moves cleanly.
8.3 Try to over-fill a room past its capacity → rejected with a "room full" message.
8.4 Delete a room with occupants → occupants become unassigned, nothing breaks.

## 9. Tour Leader
9.1 As ops, assign tourleader1 to the booking.
9.2 As tourleader1, open "My assigned tours" → sees the booking, passenger manifest info, **but no prices or payment data**.
9.3 As tourleader1, file an incident report (e.g. passenger illness) → visible to ops.
9.4 As ops, resolve the incident with notes → status updates for the leader too.
9.5 As a supplier or customer, try tour-leader pages/actions → blocked.

## 10. Change Requests
10.1 As the customer, request added passengers (+2 with details) → shows as *pending*.
10.2 As ops, approve it → party size and total price update proportionally; departure seats adjust.
10.3 Request more passengers than seats remain → approval is rejected with a seats message.
10.4 As ops, reject a request with notes → customer sees the rejection and notes.
10.5 Try approving the same request from two tabs → second attempt gets a "already resolved" error, price/seats change only once.

## 11. Documents & Exports
11.1 Generate the booking confirmation → correct tour, dates, party size, totals.
11.2 Download the rooming list CSV and passenger manifest CSV → open in Excel/Sheets; data is correct.
11.3 Enter a traveler name starting with `=` or `+` (e.g. `=SUM(1,2)`), re-download the CSV → the cell shows as text, **not** an executed formula.
11.4 As a supplier or another customer, try to download these documents → blocked.

## 12. Quotes & Pricing (existing features)
12.1 As staff, build a quote → taxes, fees, and discounts apply automatically and math is correct.
12.2 Verify a quote's price adjustments can't produce a negative or nonsensical price.
12.3 Customer views their quote → sees only final selling prices, never supplier cost data.

## 13. Supplier Isolation
13.1 As a supplier, verify they see only their own catalog/rates — never other suppliers' data, customer bookings, or selling prices.
13.2 As a customer, verify no supplier catalog or cost data is reachable, including by direct URL.

## 14. General / Cross-cutting
14.1 Repeat key flows in Spanish and Indonesian → everything remains translated and functional.
14.2 Resize to mobile width → main pages (booking, portal, ops tabs) remain usable.
14.3 Enter invalid input everywhere (empty forms, huge numbers, scripts like `<script>alert(1)</script>` in text fields) → clean validation errors, no crashes, no raw database/SQL errors shown, no script execution.
14.4 Use the browser back button mid-flow → no broken states.

---

**Tip for the tester:** for every "blocked" scenario, also try the direct URL / API route, not just the missing button — hidden buttons are not security.
