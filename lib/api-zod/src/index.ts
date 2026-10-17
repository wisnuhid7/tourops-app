export * from "./generated/api";
export * from "./generated/types";
import { z } from "zod";

export const roomAllocationSchema = z.object({
  roomType: z.string(),
  count: z.number().int().min(1),
});
export type RoomAllocation = z.infer<typeof roomAllocationSchema>;

export const bookingStatusValues = [
  "draft",
  "submitted",
  "pending_payment",
  "confirmed",
  "cancelled",
  "cancelled_unpaid",
  "cancelled_by_customer",
  "cancelled_by_operator",
  "expired",
  "completed",
] as const;
export type BookingStatus = typeof bookingStatusValues[number];
