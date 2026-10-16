export const BOOKING_TYPES: Record<string, string> = {
  leader_group: "Tour Leader Group",
  join_leader_group: "Join Leader Group",
  join_public_group: "Public Group",
  private_family: "Private Family",
  custom_leader: "Custom Leader",
  custom_family: "Custom Family",
};

export const BOOKING_STATUSES: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const SERVICE_TYPES: Record<string, string> = {
  airline: "Airline Ticketing",
  hotel: "Hotel",
  transport: "Land Transport",
  guide: "Guide",
  sights: "Sights & Attractions",
};

export const WORKFLOW_STATUSES: Record<string, string> = {
  not_assigned: "Not Assigned",
  assigned: "Assigned",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STEP_STATUSES: Record<string, string> = {
  pending: "Pending",
  done: "Done",
  skipped: "Skipped",
  blocked: "Blocked",
};

export const USER_ROLES: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "HQ Admin",
  customer: "Customer",
  airline_supplier: "Airline Supplier",
  country_manager: "Country Manager",
  city_manager: "City Manager",
  hotel_manager: "Hotel Manager",
  transport_manager: "Transport Manager",
  guide_manager: "Guide Manager",
  sights_manager: "Sights Manager",
  content_editor: "Content Editor",
  flight_agent: "Flight Agent",
  tour_builder: "Tour Builder",
  supplier: "Supplier",
  tour_leader: "Tour Leader",
};

export const SERVICE_WORKFLOW_STEPS: Record<string, Array<{ code: string; name: string }>> = {
  airline: [
    { code: "waiting_docs", name: "Waiting on Documents" },
    { code: "quote_submitted", name: "Quote Submitted" },
    { code: "quote_approved", name: "Quote Approved" },
    { code: "ticketed", name: "Tickets Issued" },
    { code: "completed", name: "Completed" },
  ],
  hotel: [
    { code: "request_sent", name: "Request Sent" },
    { code: "confirmation_received", name: "Confirmation Received" },
    { code: "approved", name: "Approved" },
    { code: "voucher_uploaded", name: "Voucher Uploaded" },
    { code: "completed", name: "Completed" },
  ],
  transport: [
    { code: "request_sent", name: "Route Plan Requested" },
    { code: "proposed", name: "Vehicle Allocation Proposed" },
    { code: "approved", name: "Approved" },
    { code: "details_submitted", name: "Details Submitted" },
    { code: "completed", name: "Completed" },
  ],
  guide: [
    { code: "needed", name: "Guide Needed" },
    { code: "proposed", name: "Guide Options Proposed" },
    { code: "approved", name: "Approved" },
    { code: "confirmed", name: "Guide Confirmed" },
    { code: "completed", name: "Completed" },
  ],
  sights: [
    { code: "reservation_required", name: "Reservation Required" },
    { code: "slot_returned", name: "Slot Options Returned" },
    { code: "approved", name: "Approved" },
    { code: "tickets_uploaded", name: "Tickets Uploaded" },
    { code: "completed", name: "Completed" },
  ],
};
