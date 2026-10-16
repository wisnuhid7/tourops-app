# Tourops Operational SOP

This document describes the end-to-end operational workflow for Tourops: from master data to tours, pricing, suppliers, and daily operations.

---

## 1. Purpose

This SOP ensures:
- master data stays consistent
- tours are built correctly
- pricing and quotes remain accurate
- supplier work follows a clear process
- hotel, rate, and relation data stays organized

---

## 2. Scope

This SOP covers:
- master data
- hotels, transport, guides, sights, airlines
- hotel rates and all other rate cards
- tour creation and itinerary building
- pricing engine and quotes
- supplier dashboard
- approval and validation flow

---

## 3. User Roles

### Super Admin / Admin
- manage all master data
- create and edit tours
- configure pricing, quotes, and rate cards
- approve supplier data
- publish tours

### Tour Builder
- build tours
- manage itineraries
- add tour components
- prepare tours for publishing

### Supplier / Hotel Manager / Guide Manager / Transport Manager / Sights Manager / Airline Supplier
- manage their own catalog data
- create and update rates
- process tasks from the supplier dashboard

### Operations Staff
- monitor workflow
- manage task status
- support validation and follow-up

---

## 4. General Principles

1. **Master data must be created first** before rates, tours, or quotes.
2. **Hotel rates must be linked to the hotel catalog**.
3. **Public data and cost data must be separated**.
4. **Draft status must not be treated as final data**.
5. **Major changes must be reviewed before publishing**.

---

## 5. Main Menu Structure

- **Master Data**
- **Tours**
- **Pricing Engine**
- **Rate Cards**
- **Supplier Dashboard**
- **Departures**
- **Bookings**

---

## 6. Master Data SOP

### 6.1 Country
Steps:
1. Open **Master Data**.
2. Select the **Countries** tab.
3. Add a new country.
4. Fill in the country code and country name.
5. Save.

### 6.2 City
Steps:
1. Open the **Cities** tab.
2. Add a new city.
3. Select the correct country.
4. Save.

### 6.3 Hotel
Steps:
1. Open the **Hotels** tab.
2. Add a new hotel.
3. Enter the hotel name, location, and supporting information.
4. Save.

Notes:
- hotel is **master data**
- hotel rates should always reference an existing hotel

### 6.4 Sights / Guide / Airline / Transport
General steps:
1. Add the entity in master data.
2. Keep the name consistent.
3. Save.

---

## 7. Hotel Rates SOP

### 7.1 Concept

Hotel rates are price records attached to a hotel.

Rules:
- 1 hotel can have multiple rates
- a rate should never stand alone without a hotel
- hotel rates should follow the selected country and city

### 7.2 Creating a hotel rate
1. Open **Rate Cards**.
2. Go to the **Hotel Rates** tab.
3. Click **Create Rate**.
4. Select country.
5. Select city.
6. Select the hotel from the dropdown.
7. Fill in room type.
8. Fill in meal plan if needed.
9. Select currency.
10. Fill in valid from / valid to.
11. Fill in price per room per night.
12. Save.

### 7.3 Dropdown rules
- hotel options are filtered by country and city
- when country/city changes, the hotel list changes as well
- if the current hotel no longer matches the filter, the selection is reset

### 7.4 Legacy data
- older records are still supported via fallback `hotelName`
- for new records, always choose the hotel from the dropdown

---

## 8. Supplier Dashboard SOP

### 8.1 Purpose
The supplier dashboard is used to view and complete assigned work.

### 8.2 Workflow
1. Log in as a supplier.
2. Open **Supplier Dashboard**.
3. Review active tasks.
4. Update data or status as needed.
5. Upload documents when requested.
6. Communicate blockers using the message workflow.

### 8.3 Hotel Manager
- manage hotel catalog data
- fill in hotel rates
- ensure hotel and rate relations are correct

---

## 9. Tour Creation SOP

### 9.1 Create a tour
1. Open **Tours**.
2. Click **Create Tour**.
3. Fill in the basic tour information.
4. Add title, description, countries, and metadata.
5. Save as draft.

### 9.2 Build the itinerary
1. Open the itinerary editor.
2. Add tour days.
3. Add items:
   - hotel
   - transport
   - sight
   - guide
   - meal
   - flight
   - custom item
4. Make sure every item has the correct cost.

### 9.3 Validation
- check tour duration
- check day order
- check selected hotel / guide / transport data
- check base cost total

---

## 10. Pricing Engine SOP

### 10.1 Group size bands
- define the pax bands used for pricing
- keep label, minimum, and maximum values clear

### 10.2 Pricing rules
- configure global or per-tour / per-country markup
- choose fixed or percentage value
- activate only valid rules

### 10.3 Quote
Steps to create a quote:
1. Open **Pricing Engine**.
2. Go to the **Quotes** tab.
3. Click **Create Quote**.
4. Choose a tour.
5. Enter pax count and nights.
6. Enter cost components.
7. Select hotel choices if available.
8. Save the quote.

### 10.4 Quote review
- check total group cost
- check base cost per person
- check the cost breakdown
- make sure the quote matches the tour scope

---

## 11. Departures SOP

### 11.1 Purpose
Departures define the dates that can be booked.

### 11.2 Steps
1. Open **Departures**.
2. Add a new departure.
3. Enter start date, end date, and capacity.
4. Enter a fixed price if needed.
5. Save.

### 11.3 Status
- `open` = bookable
- `closed` / `sold_out` / `cancelled` = not active

---

## 12. Approval and Status SOP

### Supplier rates
1. Supplier submits the rate.
2. The record starts as draft / pending.
3. Admin reviews the data.
4. Admin changes the status to active / approved when valid.

### Booking / workflow
- task status must reflect real progress
- status updates must match actual field conditions

---

## 13. Quality Control SOP

Before using any data as final, confirm:
- hotel name is correct
- hotel rate is linked to the hotel
- country and city are correct
- validity dates do not conflict
- price has been reviewed
- tour itinerary is complete
- quote has been reviewed

---

## 14. Daily Admin Checklist

- review new master data
- review hotel rate drafts
- review tour changes
- review newly created quotes
- review pending supplier workflows
- review upcoming departures

---

## 15. Daily Supplier Checklist

- check rates that need updates
- check pending tasks
- upload required documents
- review messages from admin or operations

---

## 16. Troubleshooting

### Hotel not appearing in the dropdown
- confirm the hotel exists in master data
- check the selected country and city
- check user access permissions

### Hotel rate not linked
- check whether `hotel_id` is filled in
- use the legacy `hotelName` fallback only for old records

### Quote is incorrect
- check the selected tour
- check active hotel rates
- check pricing rules
- check cost components

### Old data is still messy
- re-open the record and select values from the dropdown
- save it again so the relation is stored properly

---

## 17. Important Operating Rules

1. Do not create duplicate master data.
2. Do not save a rate without a link to the master entity.
3. Do not publish a tour before the itinerary is final.
4. Do not activate a rate that has not been checked.
5. Do not use free-text names when a dropdown catalog already exists.

---

## 18. Closing Note

This document is the primary operating reference for Tourops. If the workflow changes, update this SOP first before changing day-to-day processes.
