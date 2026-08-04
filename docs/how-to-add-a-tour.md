# How to Add a Tour From Scratch — Step by Step

All steps are done in the **Staff Portal**. Log in as **super_admin** (or admin) — that role can do every step. Specialized roles can help with their own parts (noted per step).

---

## Step 1 — Add the Country
**Who:** super_admin, admin, country_manager

1. Go to **Master Data** (`/admin/master-data`) → **Countries** tab.
2. Click **Add new**.
3. Fill in the required fields: **Code** (2-letter ISO, e.g. `IL`) and **Name** (e.g. Israel). Everything else (capital, continent, phone code…) is optional.
4. Leave **Active** on and click **Save**.

## Step 2 — Add the Cities
**Who:** super_admin, admin, country_manager, city_manager

1. Same page → **Cities** tab → **Add new**.
2. Required: **Name** and **Country** (you must pick the country from Step 1 — the Save button stays disabled without it).
3. Save. Repeat for every city the tour visits.

## Step 3 — Add Supporting Master Data (as needed)
**Who:** super_admin, admin (airports also country_manager)

Still in **Master Data**, use the other tabs:
- **Airports** — required: IATA **Code**, **Name**, and **City** (pick a city from Step 2).
- **Sights** — attractions with entrance prices.
- **Transport Companies**, **Airline Agencies** — if the tour uses them.

## Step 4 — Suppliers Register Their Travel Products
**Who:** each supplier role, or super_admin/admin on their behalf

In the **Supplier Dashboard** (`/supplier`), each supplier type has its own tab:
- **Hotel manager** → *Hotels catalog* → **Register hotel** (set the nightly room rates: Matrimonial / Doble / Triple — these drive the accommodation price customers pay).
- **Guide manager** → *Guide rates*.
- **Sights manager** → *Sights catalog* + *Sights rates*.
- **Airline supplier** → *Airlines catalog* + *Airline rates*.

**Important — approval flow:** every rate card a supplier submits starts as **Pending approval** (draft). Rates are only used in pricing after an **admin or super_admin approves them** (status becomes Approved/Active). So: supplier submits → admin approves.

## Step 5 — Create the Tour
**Who:** super_admin, admin, tour_builder

1. Go to **Tours** (`/admin/tours`) → **Create tour** (opens the Tour Generator).
2. Fill the three tabs:
   - **General info** — title, description, category, countries.
   - **Pricing & details** — base price per person, child price, single supplement, inclusions/exclusions, highlights.
   - **Media & tags** — cover image, gallery, tags.
3. Click **Save tour**. The tour is created as a **Draft** (customers cannot see it yet).

## Step 6 — Build the Day-by-Day Itinerary
**Who:** super_admin, admin, tour_builder

1. In **Tours**, open your tour's **itinerary editor** (list icon on the tour card) → **Daily schedule** tab.
2. **Add day** for each day: title (required), day number, country, city, description, activities, image. The tour duration follows the number of days.
3. Inside each day, click **Add schedule item** for every service:
   - Types: **hotel, guide, transport, sight (entrance), meal, flight, custom**.
   - Pick the item from the master/supplier catalog — its approved price fills in automatically as the **cost** (you can adjust it).
   - This is what feeds the pricing engine: **the tour's real price = base price + all these day-item costs + markup + service fee + hotel accommodation.** If you leave costs at 0, the price stays low.
4. Use the **Financial analytics** tab to see the calculated price breakdown before publishing.

## Step 7 — Set Markup & Fees (once, or per country)
**Who:** super_admin, admin

Go to **Pricing** (`/admin/pricing`):
- **Default service fee** and **tax rate** (global settings).
- **Markup rules** — percentage, global or per country, per service type (hotel/flight/transport/sight/all). Without a rule, a default 10% markup applies.

## Step 8 — Add Departures (dates customers can book)
**Who:** super_admin, admin

1. Go to **Departures** (`/admin/departures`) → **Create departure**.
2. Required: tour, start date, end date, capacity. Set **Price per person** here if you want a fixed price for that date (it overrides the calculated price); airports are optional.
3. Status **open** = bookable.

## Step 9 — Publish
**Who:** super_admin, admin

Back in **Tours**, click the **eye icon** on the tour card to publish. Only then does the tour appear to customers on the public site.

---

### Quick checklist
Country → Cities → Airports/Sights → Supplier products + rates → **Admin approves rates** → Create tour → Day-by-day items with costs → Markup/fees → Departures → **Publish**.
