import { db } from "./server/db";
import { userProfiles, bookings } from "./shared/schema";
import { users } from "./shared/models/auth";

async function main() {
  const allUsers = await db.select().from(users);
  console.log("Users:", allUsers.map(u => ({ id: u.id, username: u.username })));

  const allProfiles = await db.select().from(userProfiles);
  console.log("Profiles:", allProfiles.map(p => ({ id: p.id, userId: p.userId, role: p.role, isTourLeader: p.isTourLeader })));

  const allBookings = await db.select().from(bookings);
  console.log("Bookings:", allBookings.map(b => ({ id: b.id, customerId: b.customerId, bookingType: b.bookingType, status: b.status })));
}

main().catch(console.error);
