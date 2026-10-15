/**
 * Auth / role middleware and the shared role-set catalogue.
 *
 * Extracted verbatim from routes.ts so route modules can gate requests without
 * importing the monolith (which pulled in every domain handler). Behaviour is
 * unchanged: the same role sets, the same 401/403 responses, the same
 * fail-closed handling for unprovisioned accounts.
 */
import type { Request, Response } from "express";
import { storage } from "../storage";

const ALL_STAFF_ROLES = [
  "admin", "super_admin",
  "airline_supplier", "country_manager", "city_manager",
  "hotel_manager", "transport_manager", "guide_manager",
  "sights_manager", "content_editor", "flight_agent",
  "tour_builder", "supplier", "tour_leader", "accounting",
  "operations_manager", "support_agent",
];

// Both admin and super_admin have full administrative access
const ADMIN_ROLES = ["admin", "super_admin"];

// Internal staff = all staff EXCEPT external supplier roles. External suppliers
// (airline_supplier) must not see the staff directory, global assignments,
// hotels, or mutate global master data (countries/cities/airports) — they only
// manage their own airline domain (per role spec).
const EXTERNAL_SUPPLIER_ROLES = ["airline_supplier"];
const INTERNAL_STAFF_ROLES = ALL_STAFF_ROLES.filter(r => !EXTERNAL_SUPPLIER_ROLES.includes(r));
// city_manager's remit is a single assigned city (user_profiles.city_id) and
// content_editor's remit is descriptive tour content (per role specs): neither
// may read platform-wide bookings, the staff directory, assignments, or the
// full hotel list — their dashboards don't need them.
// guide_manager is likewise limited to its own guide domain (own-scoped guide
// rates + assigned workflows via /api/supplier/*): no platform-wide reads.
// hotel_manager is scoped to hotels it registered (hotels.created_by).
// The generic "supplier" role is an external vendor: it only sees its own
// assigned workflows via /api/supplier/* — no platform-wide reads and no
// master-data mutations (supplier-tenant isolation per role spec).
// tour_leader only sees its own led/created bookings (scoped in the bookings
// GET handlers) — never the whole platform.
const PLATFORM_WIDE_READ_ROLES = INTERNAL_STAFF_ROLES.filter(r => !["city_manager", "content_editor", "guide_manager", "hotel_manager", "sights_manager", "accounting", "supplier", "support_agent", "tour_leader", "transport_manager"].includes(r));
// support_agent assists customers on their bookings: read bookings, read the
// booking conversation, see payment status — never mutate finance or operations.
const SUPPORT_READ_ROLES = [...ADMIN_ROLES, "support_agent"];
// accounting handles the financial lifecycle: bookings (read), invoices and
// payments (read + record/confirm). No operational or master-data authority.
export const FINANCE_ROLES = ["super_admin", "admin", "accounting"];
// Who may read the full customer booking book: management/oversight roles plus
// finance (accounting) and support (support_agent). Deliberately EXCLUDES
// flight_agent and tour_builder — their dashboards read workflows/tours, not
// bookings — to avoid over-exposing customer PII. tour_leader is handled
// separately with row scoping to their own/led bookings.
const BOOKING_READ_ROLES = ["super_admin", "admin", "country_manager", "operations_manager", "accounting", "support_agent"];
// Master records (countries/cities/airports and other global reference data)
// may only be mutated by operational manager roles — not by city_manager
// (single-city remit) or content_editor (content-only remit).
const MASTER_RECORDS_MANAGE_ROLES = INTERNAL_STAFF_ROLES.filter(r => !["city_manager", "content_editor", "guide_manager", "hotel_manager", "sights_manager", "accounting", "operations_manager", "supplier", "support_agent", "tour_leader", "transport_manager"].includes(r));
// operations_manager dispatches resources: broad operational reads plus
// assignment/workflow management, but no pricing, finance, master-data or
// user administration authority.
const OPS_DISPATCH_ROLES = [...ADMIN_ROLES, "operations_manager"];

// Catalog/master-data managers: base staff plus per-domain supplier roles.
// Each supplier role manages its own catalog category (rates + master records).
const CATALOG_BASE_ROLES = ["super_admin", "admin", "country_manager"];
const HOTEL_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "hotel_manager"];
// Who may register (submit) a master hotel record. Hotel managers can submit,
// but their submissions stay in "draft" until an admin/super_admin approves.
const HOTEL_REGISTER_ROLES = [...ADMIN_ROLES, "hotel_manager"];
// Who may edit/delete a master hotel record: admins plus hotel managers.
// (Approval status changes remain admin-only — enforced in the PATCH handler.)
const HOTEL_EDIT_ROLES = [...ADMIN_ROLES, "hotel_manager"];
const GUIDE_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "guide_manager"];
// Tour builders and operations staff can read guide rates to assign guides to itineraries
const GUIDE_READ_ROLES = [...GUIDE_MANAGE_ROLES, "tour_builder", "operations_manager"];
const SIGHTS_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "sights_manager"];
const AIRLINE_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "airline_supplier"];
const TRANSPORT_COMPANY_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "transport_manager"];
// Finance mutations (invoices/payments): admins + transport_manager only — country_manager excluded.
const TRANSPORT_FINANCE_ROLES = [...ADMIN_ROLES, "transport_manager"];

// Tour builders assemble itineraries (days/items) and can create/edit tour structure & pricing
const TOUR_BUILDER_ROLES = [...ADMIN_ROLES, "tour_builder"];
// Content editors + tour builders can edit tour marketing/content fields
const TOUR_CONTENT_ROLES = [...ADMIN_ROLES, "tour_builder", "content_editor"];

export function getUserId(req: Request): string | undefined {
  return req.session?.userId;
}

export async function requireRole(req: Request, res: Response, roles: string[]): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return false; }
  let profile;
  try {
    profile = await storage.getOrCreateProfile(userId);
  } catch (e: any) {
    // AUTHZ-02: unprovisioned account — fail closed with a clear message.
    res.status(e?.statusCode || 403).json({ message: e?.message || "Forbidden" });
    return false;
  }
  if (!roles.includes(profile.role)) {
    res.status(403).json({ message: "Forbidden: insufficient role" });
    return false;
  }
  return true;
}

// Returns true when the request carries a valid session whose profile role is
// internal/external staff (i.e. not a customer / not anonymous). Used to gate
// otherwise-public tour detail reads so drafts stay staff-only (AUTHZ-01).
export async function isStaffViewer(req: Request): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) return false;
  try {
    const profile = await storage.getOrCreateProfile(userId);
    return ALL_STAFF_ROLES.includes(profile.role as any);
  } catch { return false; }
}

// Role-set catalogue (exported for route modules that gate their own handlers).
export {
  ALL_STAFF_ROLES,
  ADMIN_ROLES,
  EXTERNAL_SUPPLIER_ROLES,
  INTERNAL_STAFF_ROLES,
  PLATFORM_WIDE_READ_ROLES,
  SUPPORT_READ_ROLES,
  BOOKING_READ_ROLES,
  MASTER_RECORDS_MANAGE_ROLES,
  OPS_DISPATCH_ROLES,
  CATALOG_BASE_ROLES,
  HOTEL_MANAGE_ROLES,
  HOTEL_REGISTER_ROLES,
  HOTEL_EDIT_ROLES,
  GUIDE_MANAGE_ROLES,
  GUIDE_READ_ROLES,
  SIGHTS_MANAGE_ROLES,
  AIRLINE_MANAGE_ROLES,
  TRANSPORT_COMPANY_MANAGE_ROLES,
  TRANSPORT_FINANCE_ROLES,
  TOUR_BUILDER_ROLES,
  TOUR_CONTENT_ROLES,
};
