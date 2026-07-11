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
