# Multi-Step Service Workflow (QA 2026-07-31)

Scope: admin/workflow-detail.tsx (redesigned 2026-07-31), /api/workflows, /api/workflow-steps.

## Positive
- PASS — Workflow detail renders: header (service icon chip, status badge, booking link), 4 summary cards, progress bar, vertical timeline of steps (Airline/Hotel/Transport/Guide/Sights ordering respected via stepOrder).
- PASS — Step status change (Pending → Done → Pending): "Step Updated" toasts, progress bar updates (0% → 20% → 0%).
- PASS — Inline notes editor: due-date + notes with explicit Save/Cancel; save round-trips; cancel discards.
- PASS — Workflow-level status select updates and persists.
- PASS — Loading skeleton, not-found and empty-steps states present.

## Validation / Negative
- Steps may be completed in any order by design (operations often complete Hotel before Airline); ordering is display ordering, not a strict gate. No "skip step" restriction exists intentionally — steps have an explicit "skipped" status.
- Step deletion is not exposed to admins in this UI (no delete control) — "delete active step" not applicable.
- Overdue steps: red-bordered card + Overdue badge (non-blocking).

## UI review (previous "partially polished" note)
- Timeline, cards, forms, loading and empty states all pass visual check after the redesign. The "complex UI partially polished" note in FEATURES_TODO is resolved.

## Status
PASS.
