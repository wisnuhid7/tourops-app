import { db } from "./db";
import { users } from "../shared/models/auth";
import { userProfiles, tours, tourDepartures, bookings, travelers } from "../shared/schema";
import { eq } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";
import crypto from "crypto";

function generateJoinCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function generateBookingCode() {
  return `BK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function seedBookings() {
  console.log("🌱 Starting booking seeder...");

  // 1. Get some active departures to book
  const allTours = await db.select().from(tours);
  const allDepartures = await db.select().from(tourDepartures);

  if (allDepartures.length === 0) {
    console.error("❌ No departures found! Please run 'npm run seed' first to generate tours and departures.");
    process.exit(1);
  }

  const departure1 = allDepartures[0];
  const tour1 = allTours.find(t => t.id === departure1.tourId);

  // 2. Get all users
  const allUsers = await db.select().from(users);
  
  if (allUsers.length < 2) {
    console.log("Not enough users to form groups. Creating dummy customers...");
    const dummyNames = ["Alice", "Bob", "Charlie", "Diana"];
    for (const name of dummyNames) {
      await authStorage.upsertUser({
        id: `customer-${name.toLowerCase()}`,
        username: name.toLowerCase(),
        passwordHash: "dummy",
        email: `${name.toLowerCase()}@example.com`
      });
      await db.insert(userProfiles).values({ userId: `customer-${name.toLowerCase()}`, role: "customer" });
    }
  }

  const updatedUsers = await db.select().from(users);

  // We will make the first user the Leader, and the others Participants
  const leaderUser = updatedUsers[0];
  const participantUsers = updatedUsers.slice(1, Math.min(updatedUsers.length, 6));

  console.log(`Creating leader booking for ${leaderUser.username}...`);

  // Create Leader Booking
  let leaderBookingId = "";
  let joinCode = generateJoinCode();

  const existingLeaderBookings = await db.select().from(bookings).where(eq(bookings.customerId, leaderUser.id));
  
  if (existingLeaderBookings.length === 0) {
    const [leaderBooking] = await db.insert(bookings).values({
      bookingCode: generateBookingCode(),
      tourId: tour1?.id,
      departureId: departure1.id,
      customerId: leaderUser.id,
      bookingType: "leader_group",
      groupName: `${leaderUser.username}'s Adventure Group`,
      leaderUserId: leaderUser.id,
      joinCode: joinCode,
      partySizeExpected: participantUsers.length + 1,
      status: "confirmed",
      totalPrice: parseInt(tour1?.basePrice || "0") * (participantUsers.length + 1)
    }).returning();
    leaderBookingId = leaderBooking.id;

    // Add traveler for leader
    await db.insert(travelers).values({
      bookingId: leaderBookingId,
      firstName: leaderUser.username || "Leader",
      lastName: "Primary",
      nationality: "ID",
      gender: "male"
    });
  } else {
    leaderBookingId = existingLeaderBookings[0].id;
    joinCode = existingLeaderBookings[0].joinCode || joinCode;
    console.log("Leader already has a booking. Reusing...");
  }

  console.log(`Join Code generated: ${joinCode}`);

  // Create Participant Bookings (Joining the leader group)
  for (const pUser of participantUsers) {
    console.log(`Creating participant booking for ${pUser.username}...`);
    const existingPBooking = await db.select().from(bookings).where(eq(bookings.customerId, pUser.id));
    
    if (existingPBooking.length === 0) {
      const [pBooking] = await db.insert(bookings).values({
        bookingCode: generateBookingCode(),
        tourId: tour1?.id,
        departureId: departure1.id,
        customerId: pUser.id,
        bookingType: "join_leader_group",
        groupName: `${leaderUser.username}'s Adventure Group`,
        leaderUserId: leaderUser.id,
        partySizeExpected: 1,
        status: "confirmed",
        totalPrice: parseInt(tour1?.basePrice || "0")
      }).returning();

      await db.insert(travelers).values({
        bookingId: pBooking.id,
        firstName: pUser.username || "Participant",
        lastName: "Guest",
        nationality: "ID",
        gender: "male"
      });
    } else {
      console.log(`Participant ${pUser.username} already has a booking.`);
    }
  }

  console.log("✅ Booking seeding complete!");
  process.exit(0);
}

seedBookings().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
