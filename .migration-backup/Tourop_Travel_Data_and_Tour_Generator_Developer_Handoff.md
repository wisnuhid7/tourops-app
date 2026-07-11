# Tourop Travel Data + Tour Generator System

**Developer Handoff Document for Antigravity, Sonnet, Replit, or an Engineering Team**

**Purpose:** This document defines the missing Tourop tools: data importers, compliant scrapers/API adapters, hotel data system, airline ticket price generator, and day-by-day tour generator.

**Main rule:** Tourop should use approved APIs and open datasets first. Scrapers should only be used where legally allowed, especially on official attraction/supplier pages or sources that permit crawling.

| **Document Area** | **Description** |
|---|---|
| Platform goal | Build a travel data engine and tour builder for countries, cities, sights, hotels, flights, and custom itineraries. |
| Primary users | Tourop admins, content editors, travel agents, suppliers, and clients. |
| Recommended stack | Next.js, Tailwind CSS, Node.js API, PostgreSQL, Prisma, Redis, BullMQ workers, S3-compatible storage. |
| AI rule | AI helps generate and organize tours, but verified Tourop database records remain the source of truth. |

---

## Table of Contents

1. [Project Goal and Scope](#1-project-goal-and-scope)
2. [Non-Negotiable Compliance Rules](#2-non-negotiable-compliance-rules)
3. [System Architecture](#3-system-architecture)
4. [Main Tools Needed](#4-main-tools-needed)
5. [Country Importer](#5-country-importer)
6. [City Importer](#6-city-importer)
7. [Sight / Attraction Importer](#7-sight--attraction-importer)
8. [Sight Enrichment and Image System](#8-sight-enrichment-and-image-system)
9. [Hotel Data and Price Tool](#9-hotel-data-and-price-tool)
10. [Airline Ticket Price Generator](#10-airline-ticket-price-generator)
11. [Tour Generator Tool](#11-tour-generator-tool)
12. [AI Tour Generator Rules](#12-ai-tour-generator-rules)
13. [Admin Dashboard Screens](#13-admin-dashboard-screens)
14. [Database Tables](#14-database-tables)
15. [API Endpoints](#15-api-endpoints)
16. [Source Adapter Design](#16-source-adapter-design)
17. [Pricing Logic](#17-pricing-logic)
18. [Roles and Permissions](#18-roles-and-permissions)
19. [Development Phases](#19-development-phases)
20. [Acceptance Criteria](#20-acceptance-criteria)
21. [Environment Variables](#21-environment-variables)
22. [Copy-Paste Prompt for Antigravity / Sonnet](#22-copy-paste-prompt-for-antigravity--sonnet)
23. [Final Simple Summary](#23-final-simple-summary)

---

## 1. Project Goal and Scope

Tourop needs a complete internal system to collect travel data, normalize it, store it, allow admin review, and use it to generate professional custom tours.

- Create a global list of countries.
- Create a city database for each country.
- Collect sights and attraction information for each country and city.
- Collect images, descriptions, opening hours, and ticket costs for sights.
- Collect hotel information and hotel price snapshots.
- Create an airline ticket price search/generator using travel parameters.
- Build a tour generator that lets a client modify an existing tour template or create a tour day by day.
- Build an AI tour generator that uses verified database records and clearly flags missing or unconfirmed data.

| **System Principle** | **Meaning** |
|---|---|
| Tourop Database = Master Truth | The internal database should hold approved records used by the website and tour generator. |
| APIs/Open Data = Preferred Sources | Use official APIs/open datasets before attempting any scraper. |
| Scrapers = Last Resort | Only scrape sources that allow it. Never bypass technical restrictions. |
| Admin Review = Final Approval | Human staff approve records before publishing or using them for client-facing itineraries. |
| AI = Helper | AI writes, organizes, and proposes tours. It should not invent factual data. |

---

## 2. Non-Negotiable Compliance Rules

The developer must build the data system in a compliant way. Tourop should avoid unauthorized scraping of major travel platforms and must not bypass protection systems.

- Do not bypass CAPTCHA, login walls, paywalls, private APIs, or anti-bot systems.
- Do not scrape Booking.com, Google, airlines, Expedia, TripAdvisor, Viator, or similar platforms unless Tourop has approved API/affiliate access or written permission.
- Respect `robots.txt` and source terms where applicable.
- Store source name, source URL, external ID, license/attribution, and last-synced date for each imported record.
- Use official APIs and open datasets first.
- Use scrapers mainly for official attraction websites, government tourism pages, supplier pages, or sources that allow crawling.
- Add a domain kill switch so admin can stop scraping any source immediately.

| **Do** | **Do Not** |
|---|---|
| Use REST Countries or similar sources for country master data. | Do not scrape random country lists from unverified websites. |
| Use GeoNames/OpenStreetMap for city and coordinate data. | Do not copy protected data from paid travel sites without permission. |
| Use official attraction websites for opening hours/tickets when allowed. | Do not bypass bot protection or login requirements. |
| Use hotel/flight supplier APIs or affiliate APIs. | Do not scrape live prices from booking or airline websites. |

---

## 3. System Architecture

The system should be built as an internal admin platform plus APIs that the Tourop website and tour builder can use.

| **Layer** | **Recommended Technology** | **Purpose** |
|---|---|---|
| Frontend | Next.js + Tailwind CSS | Admin dashboards, tour builder, client-facing screens. |
| Backend API | Node.js / TypeScript | Business logic, CRUD, data tools, supplier API integration. |
| Database | PostgreSQL + Prisma | Master travel records, tours, prices, import logs. |
| Queue/Workers | Redis + BullMQ | Long-running import, enrichment, price-search, and AI jobs. |
| Storage | S3-compatible object storage | Images, thumbnails, exports, PDFs. |
| AI | OpenAI or selected LLM provider | Generate itinerary suggestions using verified context. |

### Recommended Folder Structure

```
tourop/
  apps/
    web/
      app/
      components/
      lib/
      styles/
    api/
      src/
        modules/
          countries/
          cities/
          sights/
          hotels/
          flights/
          tours/
          ai-tour-generator/
          data-import/
        workers/
        queues/
        services/
        adapters/
        prisma/
        utils/
  packages/
    shared/
      types/
      validators/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  docker-compose.yml
  README.md
  .env.example
```

---

## 4. Main Tools Needed

| **Tool** | **Purpose** | **Main Output** |
|---|---|---|
| Country Importer | Import and maintain all countries. | Countries database. |
| City Importer | Import cities for every country. | Cities database with location and tourism ranking. |
| Sight Importer | Import attractions and points of interest. | Sights database by country/city/category. |
| Sight Enrichment Tool | Add description, hours, ticket prices, images, and quality score. | Approved attraction records. |
| Image Tool | Collect, process, approve, and store images. | Image galleries and thumbnails. |
| Hotel Tool | Search and store hotel data and price snapshots. | Hotel records and pricing history. |
| Flight Price Generator | Search lowest fares using parameters. | Flight price snapshots and offer details. |
| Tour Generator | Create or modify day-by-day tours. | Tour templates, custom tours, quotes, and PDF itineraries. |
| AI Tour Generator | Suggest itinerary using verified records. | Structured JSON itinerary with warnings. |

---

## 5. Country Importer

The country importer creates the global master list of countries. Admin should be able to activate only the countries where Tourop will sell tours.

### Country Fields

- `name_en`
- `name_local`
- `iso2`
- `iso3`
- `continent`
- `region`
- `subregion`
- `capital_city`
- `currency_code`
- `currency_name`
- `languages`
- `phone_code`
- `timezone_list`
- `flag_svg_url`
- `flag_png_url`
- `latitude`
- `longitude`
- `population`
- `is_active_for_tourop`
- `source_name`
- `source_external_id`
- `last_synced_at`

### Admin Functions

- Import countries
- View countries
- Edit country information
- Activate/deactivate countries
- Choose which countries appear on Tourop
- View import logs and errors

| **Endpoint** | **Purpose** |
|---|---|
| `POST /api/admin/data-import/countries/run` | Run country importer. |
| `GET /api/admin/countries` | List countries for admin. |
| `GET /api/admin/countries/:id` | View country details. |
| `PATCH /api/admin/countries/:id` | Update country. |

---

## 6. City Importer

The city importer creates and updates the city list for each country. It should support automatic import plus manual admin correction.

### City Fields

- `country_id`
- `name`
- `ascii_name`
- `alternate_names`
- `admin_region`
- `population`
- `latitude`
- `longitude`
- `timezone`
- `geoname_id`
- `osm_id`
- `city_rank`
- `is_capital`
- `is_tourism_city`
- `is_active`
- `source_name`
- `last_synced_at`

### City Ranking Logic

- Population size
- Capital city status
- Number of sights nearby
- Hotel availability
- Airport availability
- Search popularity
- Manual admin boost

### Admin Functions

- Import cities by country
- View cities by country
- Edit city names
- Mark city as tourism city
- Disable a city
- Merge duplicate cities
- Manually add a missing city

| **Endpoint** | **Purpose** |
|---|---|
| `POST /api/admin/data-import/cities/run` | Run city importer. |
| `GET /api/admin/cities?countryId=` | List cities by country. |
| `GET /api/admin/cities/:id` | View city details. |
| `PATCH /api/admin/cities/:id` | Update city. |
| `POST /api/admin/cities/:id/merge` | Merge duplicate city records. |

---

## 7. Sight / Attraction Importer

The sight importer discovers attractions such as museums, monuments, beaches, parks, historical sites, religious sites, adventure activities, viewpoints, and cultural places.

### Recommended Sight Categories

- `museum`
- `monument`
- `historic_site`
- `religious_site`
- `beach`
- `national_park`
- `theme_park`
- `viewpoint`
- `market`
- `shopping_area`
- `restaurant_area`
- `nightlife_area`
- `adventure_activity`
- `nature`
- `island`
- `waterfall`
- `zoo`
- `aquarium`
- `cultural_center`
- `theater`
- `event_venue`
- `photo_spot`
- `family_activity`
- `romantic_place`
- `free_activity`
- `paid_activity`

### Sight Fields

- `country_id`
- `city_id`
- `name`
- `slug`
- `description_short`
- `description_long`
- `category`
- `subcategories`
- `address`
- `latitude`
- `longitude`
- `official_website`
- `phone`
- `email`
- `opening_hours_raw`
- `opening_hours_structured`
- `ticket_cost_raw`
- `ticket_cost_adult`
- `ticket_cost_child`
- `ticket_cost_currency`
- `is_free`
- `estimated_visit_duration_minutes`
- `best_time_to_visit`
- `accessibility_notes`
- `dress_code`
- `safety_notes`
- `booking_required`
- `source_name`
- `source_external_id`
- `source_url`
- `data_quality_score`
- `last_synced_at`
- `status`

### Sight Data Quality Score

| **Quality Factor** | **Points** |
|---|---|
| Has coordinates | +20 |
| Has category | +10 |
| Has image | +10 |
| Has description | +10 |
| Has opening hours | +10 |
| Has ticket price | +10 |
| Has official website | +10 |
| Has address | +10 |
| Approved by admin | +10 |

> If the sight quality score is below 50, the admin dashboard should show it as **Needs Review**.

### Admin Functions

- Import sights by country
- Import sights by city
- Edit sight content
- Add ticket prices
- Add opening hours
- Upload or approve images
- Approve/reject imported data
- Publish/unpublish sights

---

## 8. Sight Enrichment and Image System

After a sight is discovered, a separate enrichment process should improve the record with stronger descriptions, images, hours, prices, and metadata.

### Enrichment Sources

- Wikipedia/Wikivoyage summary where allowed and properly attributed
- Wikimedia Commons images where licenses allow usage
- Google Places details where Tourop has API access and usage rights
- Official attraction website
- Manual admin content
- AI-generated summary created only from verified source records

### AI Content Rules for Enrichment

- AI may rewrite verified information into clean Tourop content.
- AI must not invent ticket prices, opening hours, phone numbers, hotel costs, flight prices, or official websites.
- Every AI-generated text should store `ai_generated`, `ai_model`, `source_ids_used`, and `human_review_status`.

### Image Fields

- `entity_type`
- `entity_id`
- `image_url`
- `local_storage_url`
- `thumbnail_url`
- `source_name`
- `source_url`
- `photographer_name`
- `license_name`
- `license_url`
- `attribution_required`
- `width`
- `height`
- `dominant_color`
- `is_primary`
- `sort_order`
- `approved_by_admin`
- `created_at`

### Image Processing Requirements

- Download image only if allowed
- Resize to multiple sizes
- Generate thumbnail
- Compress image
- Detect duplicates
- Detect broken images
- Store image metadata
- Allow admin approval/rejection

| **Image Size** | **Dimensions** |
|---|---|
| Thumbnail | 300 x 200 |
| Card image | 600 x 400 |
| Hero image | 1600 x 900 |
| Gallery image | 1200 x 800 |

---

## 9. Hotel Data and Price Tool

The hotel tool should search, store, and display hotel information by country and city. Prefer supplier APIs, affiliate APIs, or manual supplier contracts instead of scraping major hotel websites.

### Hotel Fields

- `country_id`
- `city_id`
- `name`
- `slug`
- `description`
- `address`
- `latitude`
- `longitude`
- `star_rating`
- `guest_rating`
- `review_count`
- `amenities`
- `images`
- `room_types`
- `checkin_time`
- `checkout_time`
- `hotel_policy`
- `cancellation_policy`
- `source_name`
- `source_hotel_id`
- `affiliate_url`
- `estimated_price_min`
- `estimated_price_max`
- `currency`
- `last_price_checked_at`
- `last_synced_at`
- `status`

### Hotel Search Parameters

- `country`
- `city`
- `check_in_date`
- `check_out_date`
- `rooms`
- `adults`
- `children`
- `child_ages`
- `budget_min`
- `budget_max`
- `star_rating_min`
- `amenities`
- `distance_from_city_center`
- `distance_from_sight`
- `free_cancellation`
- `breakfast_included`

### Hotel Price Snapshot Fields

- `hotel_id`
- `search_city_id`
- `check_in_date`
- `check_out_date`
- `adults`
- `children`
- `rooms`
- `price_total`
- `price_per_night`
- `taxes_fees`
- `currency`
- `supplier_name`
- `supplier_rate_id`
- `deep_link_url`
- `searched_at`
- `expires_at`

### Admin Functions

- Search hotels by city
- Attach hotels to tour templates
- Mark preferred hotels
- Mark blacklisted hotels
- Add internal notes
- Upload supplier contract rates manually
- Compare supplier API rate vs manual contract rate
- View hotel price history

---

## 10. Airline Ticket Price Generator

The airline ticket price generator searches for low fares based on user parameters and saves price snapshots. Use flight supplier APIs. Do not scrape airline websites.

### Search Inputs

- `origin_airport`
- `destination_airport`
- `departure_date`
- `return_date`
- `one_way_or_round_trip`
- `adults`
- `children`
- `infants`
- `cabin_class`
- `currency`
- `max_price`
- `preferred_airlines`
- `excluded_airlines`
- `direct_only`
- `max_stops`
- `bags_required`
- `flexible_dates`
- `date_window_days`

### Search Output

- `lowest_price`
- `currency`
- `airline`
- `flight_numbers`
- `departure_time`
- `arrival_time`
- `duration`
- `stops`
- `baggage_info`
- `fare_rules_summary`
- `supplier`
- `deep_link_or_booking_reference`
- `price_expires_at`

> **Important user message:** Flight prices are live estimates and can change until the ticket is confirmed by the airline or supplier.

### Flight Price Snapshot Fields

- `origin_airport`
- `destination_airport`
- `departure_date`
- `return_date`
- `adults`
- `children`
- `cabin_class`
- `airline`
- `stops`
- `duration_minutes`
- `price_total`
- `currency`
- `supplier_name`
- `supplier_offer_id`
- `raw_response_json`
- `searched_at`
- `expires_at`

| **Endpoint** | **Purpose** |
|---|---|
| `POST /api/flights/search` | Search flight offers. |
| `POST /api/flights/confirm-price` | Confirm selected offer price/availability. |
| `GET /api/admin/flights/search-history` | View saved flight search history. |

---

## 11. Tour Generator Tool

The tour generator allows a client, admin, or travel agent to create a complete tour day by day. It must support template modification, manual creation, and AI-assisted generation.

### Core Features

- Modify an existing tour template
- Create a new tour from zero
- Ask AI to generate a tour
- Add or remove days
- Add sights
- Add hotels
- Add flights
- Add transportation
- Add meals
- Add guide services
- Add free time
- Calculate estimated price
- Export itinerary to PDF
- Send quote request to suppliers
- Save as reusable template

### Mode 1: Modify Existing Tour Template

The user selects country, city, tour template, travel dates, number of travelers, budget level, hotel level, travel pace, and interests. Then the user can remove/replace sights, change hotels, add nights, remove free days, add restaurants or transfers, and reorder days.

### Mode 2: Create Tour Manually

The user creates a tour day by day. Each day can include morning activity, lunch, afternoon activity, evening activity, hotel overnight, transportation, guide, notes, and estimated cost.

### Mode 3: AI Tour Generator

The user enters destination, arrival city, departure city, number of days, dates, number of travelers, traveler type, budget, interests, travel pace, hotel level, meal preference, transport preference, accessibility needs, and language. AI returns a structured itinerary with warnings and missing-data flags.

### Traveler Types

- `solo`
- `couple`
- `family`
- `family_with_children`
- `senior_group`
- `luxury`
- `budget`
- `religious_group`
- `adventure_group`
- `student_group`
- `corporate_group`
- `tour_leader_group`
- `custom_private_group`

### Travel Interests

- `history`
- `culture`
- `beaches`
- `nightlife`
- `food`
- `nature`
- `shopping`
- `religion`
- `adventure`
- `museums`
- `photography`
- `family_activities`
- `luxury`
- `romantic`
- `local_life`
- `eco_tourism`
- `wellness`
- `sports`

### Travel Pace Rules

| **Pace** | **Rule** |
|---|---|
| `relaxed` | Maximum 2 major activities per day. |
| `normal` | Maximum 3 major activities per day. |
| `active` | Maximum 4 activities per day. |
| `very_active` | Allow up to 5 activities, but show warning. |

### Tour Template Fields

- `name`
- `slug`
- `country_id`
- `city_ids`
- `duration_days`
- `duration_nights`
- `description_short`
- `description_long`
- `default_traveler_type`
- `default_budget_level`
- `default_pace`
- `included_services`
- `excluded_services`
- `starting_city_id`
- `ending_city_id`
- `status`
- `created_by_user_id`
- `is_public_template`
- `created_at`
- `updated_at`

### Tour Day Fields

- `tour_template_id`
- `day_number`
- `title`
- `city_id`
- `description`
- `overnight_hotel_city_id`
- `estimated_day_cost`
- `currency`
- `notes`

### Tour Day Item Fields

- `tour_day_id`
- `item_type`
- `start_time`
- `end_time`
- `title`
- `description`
- `sight_id`
- `hotel_id`
- `restaurant_id`
- `transport_id`
- `flight_snapshot_id`
- `cost`
- `currency`
- `sort_order`
- `is_optional`
- `booking_required`

### Tour Day Item Types

- `arrival`
- `departure`
- `sight`
- `activity`
- `hotel_checkin`
- `hotel_checkout`
- `meal`
- `free_time`
- `transport`
- `flight`
- `guide_service`
- `shopping`
- `nightlife`
- `custom_note`

---

## 12. AI Tour Generator Rules

AI should build realistic itineraries using only verified records passed in the context. It must clearly mark missing information and avoid inventing facts.

- AI must not invent ticket prices.
- AI must not invent opening hours.
- AI must not invent hotel prices.
- AI must not invent flight prices.
- AI must not invent phone numbers or official websites.
- AI must not claim availability unless confirmed by API/supplier.
- If information is missing, write **Needs supplier confirmation**.

### AI System Prompt

```
You are Tourop AI Tour Builder.

Use only verified database records passed in the context.

Do not invent prices, opening hours, hotels, flights, ticket costs, or availability.

If data is missing, mark it as "Needs supplier confirmation".

Build realistic day-by-day itineraries based on geography, opening hours, travel time, traveler pace, and budget.
```

### AI JSON Output Example

```json
{
  "title": "7-Day Dominican Republic Culture and Beach Tour",
  "summary": "A balanced itinerary combining Santo Domingo history, beach time, food, and culture.",
  "warnings": ["Some ticket prices need supplier confirmation."],
  "days": [
    {
      "dayNumber": 1,
      "city": "Santo Domingo",
      "title": "Arrival and Colonial Zone",
      "items": [
        {
          "type": "arrival",
          "time": "14:00",
          "title": "Arrival at airport",
          "notes": "Private transfer to hotel."
        }
      ]
    }
  ],
  "estimatedCost": {
    "min": 0,
    "max": 0,
    "currency": "USD",
    "needsSupplierConfirmation": true
  }
}
```

---

## 13. Admin Dashboard Screens

| **Screen** | **Path** | **Main Features** |
|---|---|---|
| Data Import Dashboard | `/admin/data-tools` | Cards for countries, cities, sights, images, hotels, flights, and tour templates. Show total records, last import, errors, and run buttons. |
| Country Manager | `/admin/countries` | Search/filter countries, edit information, activate/deactivate, view cities/sights/hotels count. |
| City Manager | `/admin/cities` | Filter by country, search city, show tourism score, merge duplicates, mark tourism city. |
| Sight Manager | `/admin/sights` | Filter by country/city/category/quality score, edit content/hours/prices, upload image, approve/publish. |
| Hotel Manager | `/admin/hotels` | Search hotels, filter by city/rating/price, preferred/blacklist hotels, view price history, attach to tours. |
| Flight Search Tool | `/admin/flights` | Search flights by parameters, save result, attach flight to quote. |
| Tour Builder | `/tour-builder` | Create from template, create from zero, AI generate, drag/drop days/items, export PDF, save template. |

---

## 14. Database Tables

| **Group** | **Tables** |
|---|---|
| Location | `countries`, `cities`, `regions`, `airports` |
| Sights | `sights`, `sight_categories`, `sight_images`, `sight_hours`, `sight_ticket_prices`, `sight_source_links` |
| Hotels | `hotels`, `hotel_images`, `hotel_amenities`, `hotel_room_types`, `hotel_price_snapshots`, `hotel_supplier_links` |
| Flights | `airlines`, `airports`, `flight_searches`, `flight_price_snapshots`, `flight_offer_details` |
| Tours | `tour_templates`, `tour_template_days`, `tour_template_day_items`, `custom_tours`, `custom_tour_days`, `custom_tour_day_items`, `tour_quotes`, `tour_quote_items` |
| Imports | `data_sources`, `import_jobs`, `import_job_logs`, `source_records`, `scraper_runs`, `scraper_errors`, `data_quality_reviews` |
| AI | `ai_generation_jobs`, `ai_generated_itineraries`, `ai_prompt_logs`, `ai_source_contexts` |

---

## 15. API Endpoints

| **Module** | **Endpoints** |
|---|---|
| Countries | `GET /api/countries`; `GET /api/countries/:id`; `POST /api/admin/countries`; `PATCH /api/admin/countries/:id`; `POST /api/admin/data-import/countries/run` |
| Cities | `GET /api/cities?countryId=`; `GET /api/cities/:id`; `POST /api/admin/cities`; `PATCH /api/admin/cities/:id`; `POST /api/admin/data-import/cities/run` |
| Sights | `GET /api/sights?countryId=&cityId=&category=`; `GET /api/sights/:id`; `POST /api/admin/sights`; `PATCH /api/admin/sights/:id`; `POST /api/admin/data-import/sights/run`; `POST /api/admin/sights/:id/enrich`; `POST /api/admin/sights/:id/approve` |
| Hotels | `GET /api/hotels?countryId=&cityId=`; `GET /api/hotels/:id`; `POST /api/hotels/search-prices`; `POST /api/admin/hotels/import`; `PATCH /api/admin/hotels/:id` |
| Flights | `POST /api/flights/search`; `POST /api/flights/confirm-price`; `GET /api/admin/flights/search-history` |
| Tour Builder | `GET/POST/PATCH` tour templates; `POST/GET/PATCH` custom tours; `POST/PATCH/DELETE` custom tour days and day items; `POST /api/ai/tour-generator`; `POST /api/custom-tours/:id/export-pdf` |

---

## 16. Source Adapter Design

Every data source should use the same adapter pattern so Tourop can add or replace suppliers without rewriting the platform.

### Required Adapters

- REST Countries Adapter
- GeoNames Adapter
- OpenTripMap Adapter
- OpenStreetMap / Overpass Adapter
- Wikimedia Commons Adapter
- Google Places Adapter
- Booking / Hotel Supplier API Adapter
- Amadeus Flight API Adapter
- Viator Activities API Adapter
- Manual CSV Import Adapter
- Official Website Scraper Adapter where allowed

### Adapter Interface Example

```typescript
interface DataSourceAdapter {
  sourceName: string;
  searchCountries?(): Promise<CountryInput[]>;
  searchCities?(countryCode: string): Promise<CityInput[]>;
  searchSights?(params: SightSearchParams): Promise<SightInput[]>;
  getSightDetails?(externalId: string): Promise<SightDetailInput>;
  searchHotels?(params: HotelSearchParams): Promise<HotelResult[]>;
  searchFlights?(params: FlightSearchParams): Promise<FlightResult[]>;
}
```

### Scraper Safety Features

- `robots.txt` check
- Rate limit per domain
- Retry with backoff
- Source terms tracking
- Source attribution
- Admin kill switch
- Do-not-scrape domain list
- Scraper audit logs
- Error logs

---

## 17. Pricing Logic

Tour pricing should combine live supplier prices, manual supplier contract rates, and estimated price ranges. The system must clearly label whether the price is confirmed or needs supplier confirmation.

| **Pricing Priority** | **Meaning** |
|---|---|
| 1. Confirmed supplier/API price | Most reliable live or confirmed price. |
| 2. Manual contract rate | Rate entered by admin from supplier agreement. |
| 3. Latest price snapshot | Recently searched cached price. |
| 4. Estimated range | Useful for planning but not final. |
| 5. Needs confirmation | No reliable price available. |

**Tour cost formula:**
```
total = flights + hotels + sight tickets + transport + guide + meals + service fee + markup
```

### Markup Configuration

- Markup percentage by country
- Markup percentage by service type
- Minimum profit per traveler
- Fixed service fee
- Group discount
- Tour leader discount

---

## 18. Roles and Permissions

| **Role** | **Permissions** |
|---|---|
| `super_admin` | Full access to all data, settings, users, suppliers, and tools. |
| `country_manager` | Manage assigned countries. |
| `city_manager` | Manage assigned cities. |
| `content_editor` | Edit sights, content, and images. |
| `hotel_manager` | Manage hotels and rates. |
| `flight_agent` | Search and attach flights. |
| `tour_builder` | Create templates and custom tours. |
| `supplier` | Update own services and rates. |
| `travel_agent` | Create client tours and quotes. |
| `client` | Create or modify own custom tour. |

---

## 19. Development Phases

| **Phase** | **Build** |
|---|---|
| Phase 1 - Core System | Database, admin login, countries, cities, sights, manual CRUD, basic tour templates, basic tour builder. |
| Phase 2 - Data Importers | Country importer, city importer, sight importer, image importer, data quality scoring, import logs, admin approval flow. |
| Phase 3 - Hotel and Flight Tools | Hotel API integration, hotel price snapshots, flight API integration, flight price snapshots, attach hotels/flights to tours. |
| Phase 4 - AI Tour Generator | AI itinerary creation, AI tour modification, budget matching, pace matching, interest matching, missing-data warnings, PDF export. |
| Phase 5 - Supplier and Quote System | Supplier portal, manual contract rates, quote requests, supplier responses, final tour pricing, client quote approval. |

---

## 20. Acceptance Criteria

- Countries can be imported automatically.
- Cities can be imported by country.
- Sights can be imported by country and city.
- Sight images can be collected and reviewed.
- Sight hours and ticket prices can be stored.
- Hotels can be searched and attached to tours.
- Flight search returns lowest-price options from supplier/API integration.
- Tour Builder can create day-by-day itineraries.
- Existing templates can be copied and modified.
- AI can generate itineraries using only verified database records.
- Admin can review and approve imported content.
- All import jobs have logs and errors.
- All external source records are traceable.
- No unauthorized scraping is implemented.
- Tour can be exported as PDF.
- Tour can be saved as reusable template.

---

## 21. Environment Variables

```env
DATABASE_URL=
REDIS_URL=
REST_COUNTRIES_BASE_URL=
GEONAMES_USERNAME=
OPENTRIPMAP_API_KEY=
GOOGLE_MAPS_API_KEY=
BOOKING_AFFILIATE_ID=
BOOKING_API_TOKEN=
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=
VIATOR_API_KEY=
OPENAI_API_KEY=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
ADMIN_EMAIL=
JWT_SECRET=
```

---

## 22. Copy-Paste Prompt for Antigravity / Sonnet

Use the following prompt directly in Antigravity, Sonnet, Replit, or another coding agent.

---

You are building missing tools for the Tourop travel platform.

Build a full-stack travel data ingestion and tour generator system using Next.js, Tailwind CSS, Node.js API, PostgreSQL, Prisma, Redis, and BullMQ workers.

The system must include:

1. Country importer
2. City importer
3. Sight / attraction importer
4. Sight detail enrichment tool
5. Image collection and review system
6. Hotel data and hotel price search tool
7. Airline ticket price generator
8. Day-by-day tour generator
9. Admin dashboard
10. AI tour generator using verified database records only

The system must use legal APIs and open data first. Do not build illegal scrapers. Do not bypass CAPTCHA, paywalls, logins, or anti-bot systems. Do not scrape Booking.com, Google, airlines, or other major websites unless API or affiliate access is used.

All data must store source name, source URL, external ID, license/attribution information when available, and last synced date.

Required admin pages:
- `/admin/data-tools`
- `/admin/countries`
- `/admin/cities`
- `/admin/sights`
- `/admin/hotels`
- `/admin/flights`
- `/tour-builder`

Required database tables:

`countries`, `cities`, `regions`, `airports`, `sights`, `sight_categories`, `sight_images`, `sight_hours`, `sight_ticket_prices`, `hotels`, `hotel_images`, `hotel_amenities`, `hotel_room_types`, `hotel_price_snapshots`, `airlines`, `flight_searches`, `flight_price_snapshots`, `tour_templates`, `tour_template_days`, `tour_template_day_items`, `custom_tours`, `custom_tour_days`, `custom_tour_day_items`, `tour_quotes`, `tour_quote_items`, `data_sources`, `import_jobs`, `import_job_logs`, `scraper_runs`, `scraper_errors`, `data_quality_reviews`, `ai_generation_jobs`, `ai_generated_itineraries`, `ai_prompt_logs`.

Tour Builder must allow: create tour from existing template, create tour from zero, AI generate tour, add/remove/reorder days, add sights, add hotels, add flights, add transportation, add meals, add guide service, add free time, calculate estimated cost, export itinerary to PDF, save custom tour, and save as reusable template.

AI Tour Generator rules: use only verified database records. Never invent prices, opening hours, hotel prices, flight prices, or ticket costs. If data is missing, mark it as "Needs supplier confirmation". Return structured JSON day-by-day itinerary.

Build source adapters for REST Countries, GeoNames, OpenTripMap, OpenStreetMap/Overpass, Wikimedia Commons, Google Places, Booking or hotel supplier API, Amadeus Flight API, Viator Activities API, Manual CSV Import, and Official Website Scraper where allowed.

Build background workers for:
- `country-import-worker`
- `city-import-worker`
- `sight-discovery-worker`
- `sight-enrichment-worker`
- `image-processing-worker`
- `hotel-price-worker`
- `flight-price-worker`
- `tour-ai-worker`
- `data-quality-worker`

Deliver:

1. Full Prisma schema
2. Backend API routes
3. Frontend admin dashboard screens
4. Tour Builder UI
5. Source adapter interfaces
6. Worker structure
7. Environment variable template
8. Seed data
9. README with setup steps
10. Acceptance tests

---

## 23. Final Simple Summary

1. **First:** Collect countries and cities.
2. **Second:** Collect sights and attraction details.
3. **Third:** Collect images, opening hours, and ticket prices.
4. **Fourth:** Connect hotel and flight price APIs.
5. **Fifth:** Build a day-by-day tour builder.
6. **Sixth:** Add AI to help create and modify tours.
7. **Seventh:** Let admin review everything before publishing.

> **Most important rule:** AI should help organize and write the tour, but real information must come from Tourop verified database records.

---

*Tourop Developer Handoff — Travel Data, Scrapers/API Tools, Flight Price Generator, and Tour Builder*
