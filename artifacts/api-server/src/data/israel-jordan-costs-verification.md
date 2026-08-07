# Israel–Jordan Tour Cost Bootstrap — Verification Record

**Tour:** Footsteps of Faith and Ancient Wonders: Israel and Jordan – 7 Days.
**Tour ID:** `bf33bba3-8021-4cdd-9584-1b5df0ef193d`
**Applied:** 2026-08-07 via authenticated admin API calls to `https://tour-ops.replit.app`
**Reproducible via:** `artifacts/api-server/src/seed-israel-jordan-costs.ts` (idempotent, reconciles by natural key)

---

## Verified Production State (queried 2026-08-07)

### Tour
| Field | Value |
|---|---|
| `is_price_confirmed` | `true` |
| `base_price` | `1000` |
| `child_price` | `450` |
| `single_supplement` | `950` |

### Pricing Rule
| Field | Value |
|---|---|
| ID | `433de289-22d3-4a58-ac82-5a83c44067a3` |
| `margin_type` | `percentage` |
| `margin_value` | `30` % |
| `free_passenger_paying` | `10` |
| `free_passenger_free` | `1` |
| `rounding_rule` | `ten_up` (nearest $10) |
| `currency` | `USD` |
| `is_active` | `true` |

### Departures
| Start | End | Price/person | Capacity | Status | Notes |
|---|---|---|---|---|---|
| 2026-10-05 | 2026-10-11 | **$1,999** | 20 | open | Autumn peak |
| 2027-02-08 | 2027-02-14 | **$1,899** | 20 | open | Winter shoulder |
| 2027-05-03 | 2027-05-09 | **$2,099** | 20 | open | Spring peak |

The public tour page shows **"Starting from $1,899"** (lowest open departure).

---

## Day-by-Day Schedule & Costs

| Day | City | Guide | Hotel | Transport (group) | Sightseeing (pp) |
|---|---|---|---|---|---|
| 1 | Tiberias, IL | MOlina Diaz ($500) | Rede Andrade SLZ | $250 | — |
| 2 | Tiberias, IL | MOlina Diaz ($500) | Rede Andrade SLZ | $200 | Sea of Galilee Boat Ride $15 |
| 3 | Jerusalem, IL | MOlina Diaz ($500) | Jerusalem Hotel | $250 | — |
| 4 | Jerusalem, IL | MOlina Diaz ($500) | Jerusalem Hotel | $200 | — |
| 5 | Madaba, JO | Pedro Diaz ($400) | Jerusalem Hotel | $300 | — |
| 6 | Petra, JO | MOlina Diaz ($500) | Rede Andrade SLZ | $200 | Petra Treasury & Siq $70 |
| 7 | Amman, JO | — | — (departure) | $250 | Dead Sea Beach Access $20 |

---

## Supplier Catalog Used

### Hotels (room rates from catalog)
| Hotel | matrimonial/night | double/night | triple/night | Nights |
|---|---|---|---|---|
| Rede Andrade SLZ Hotel | $300 | $400 | $500 | 3 (days 1, 2, 6) |
| Jerusalem Hotel | $200 | $250 | $350 | 3 (days 3, 4, 5) |

Per-person double rate: $200 and $125 respectively (room ÷ 2).

### Guide Rates
| Guide | Rate | Days |
|---|---|---|
| MOlina Diaz (`b9c10e80`) | $500/day | Days 1, 2, 3, 4, 6 → 5 days |
| Pedro Diaz (`7a1ac5a9`) | $400/day | Day 5 → 1 day |

### Sight Catalog Entries (created for this tour)
| Sight | City | Per-person cost |
|---|---|---|
| Sea of Galilee Boat Ride | Tiberias | $15 |
| Petra Treasury & Siq Entrance | Petra | $70 |
| Dead Sea Beach Access | Amman | $20 |

---

## Price Derivation (reference: 16 pax, double occupancy)

| Component | Per-person |
|---|---|
| Guides: (5 × $500 + 1 × $400) ÷ 16 | $181.25 |
| Transport: $1,650 ÷ 16 | $103.13 |
| Sightseeing: $15 + $70 + $20 | $105.00 |
| Hotel – Rede Andrade SLZ (3 nights × $200 pp) | $600.00 |
| Hotel – Jerusalem Hotel (3 nights × $125 pp) | $375.00 |
| **Base cost (all components, both hotels)** | **$1,364.38** |
| + 30 % margin | $1,773.69 |
| × 11/10 free-pax factor | $1,951.06 |
| Rounded up to nearest $10 | **$1,960** |

Departure prices ($1,899–$2,099) bracket this reference for groups of 10–20 pax.

**Note:** The pricing engine treats hotels as alternative choices rather than sequential stays.
Departure prices are therefore set manually to account for the full 6-night cost (both hotels).
See task #78 for completing the itinerary and task #79 for a computed-vs-listed price comparison tool.
