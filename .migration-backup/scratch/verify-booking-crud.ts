import { storage } from "../server/storage";
import { db } from "../server/db";
import { users } from "../shared/models/auth";
import { tours, tourDepartures, travelers, payments, documents, bookings } from "../shared/schema";
import { eq } from "drizzle-orm";

async function verifyBookingCRUD() {
  console.log("🔍 [TEST] Starting Booking CRUD & Cascade Delete Verification...\n");

  // 1. Fetch test pre-requisites
  const allUsers = await db.select().from(users);
  const allTours = await db.select().from(tours);
  const allDepartures = await db.select().from(tourDepartures);

  if (allUsers.length === 0 || allTours.length === 0 || allDepartures.length === 0) {
    console.error("❌ Test setup failed: Missing Users, Tours, or Departures in the database.");
    process.exit(1);
  }

  const testUser = allUsers[0];
  const testTour = allTours[0];
  const testDeparture = allDepartures[0];

  console.log(`👤 Using test user: ${testUser.username}`);
  console.log(`🗺️ Using test tour: ${testTour.title}`);
  console.log(`🚀 Using test departure: ${testDeparture.startDate}\n`);

  // ==================== STEP 1: CREATE ====================
  console.log("--- 1. Testing CREATE Booking ---");
  const testBookingCode = `TEST-BK-${Date.now()}`;
  const booking = await storage.createBooking({
    bookingCode: testBookingCode,
    tourId: testTour.id,
    departureId: testDeparture.id,
    customerId: testUser.id,
    bookingType: "private_family",
    groupName: "Test Family Booking",
    partySizeExpected: 3,
    status: "submitted",
    fulfillmentStatus: "pending",
    totalPrice: parseInt(testTour.basePrice || "0") * 3,
  });

  if (booking && booking.id) {
    console.log(`✅ Create Successful! Booking ID: ${booking.id}, Code: ${booking.bookingCode}`);
  } else {
    console.error("❌ Create failed: Booking returned is invalid.");
    process.exit(1);
  }

  // Add associated entities to verify Cascade Delete
  console.log("\nAdding associated entities (Traveler, Payment, Document)...");
  
  const traveler = await storage.createTraveler({
    bookingId: booking.id,
    firstName: "TestTraveler",
    lastName: "One",
    nationality: "ID",
    gender: "male",
  });
  console.log(`  ✓ Traveler created: ${traveler.firstName} ${traveler.lastName}`);

  const payment = await storage.createPayment({
    bookingId: booking.id,
    amount: 1500,
    currency: "USD",
    method: "bank_transfer",
    status: "paid",
    notes: "Test Payment",
  });
  console.log(`  ✓ Payment created: ${payment.amount} ${payment.currency} - ${payment.status}`);

  const doc = await storage.createDocument({
    bookingId: booking.id,
    docType: "passport",
    fileName: "test_passport.pdf",
    fileUrl: "/uploads/test_passport.pdf",
    status: "approved",
  });
  console.log(`  ✓ Document created: ${doc.fileName}`);

  // ==================== STEP 2: READ ====================
  console.log("\n--- 2. Testing READ Booking ---");
  const retrieved = await storage.getBooking(booking.id);
  if (retrieved && retrieved.bookingCode === testBookingCode) {
    console.log("✅ Read by ID Successful!");
  } else {
    console.error("❌ Read by ID failed.");
    process.exit(1);
  }

  const customerBookings = await storage.getBookingsByCustomer(testUser.id);
  if (customerBookings.some(b => b.id === booking.id)) {
    console.log("✅ Read by Customer Successful!");
  } else {
    console.error("❌ Read by Customer failed.");
    process.exit(1);
  }

  // ==================== STEP 3: UPDATE ====================
  console.log("\n--- 3. Testing UPDATE Booking ---");
  const updated = await storage.updateBooking(booking.id, {
    status: "confirmed",
    notes: "Updated test notes",
  });

  if (updated && updated.status === "confirmed" && updated.notes === "Updated test notes") {
    console.log("✅ Update Successful!");
  } else {
    console.error("❌ Update failed.");
    process.exit(1);
  }

  // ==================== STEP 4: DELETE & CASCADE ====================
  console.log("\n--- 4. Testing DELETE & CASCADE ---");
  console.log(`Deleting booking ID ${booking.id}...`);
  await storage.deleteBooking(booking.id);
  console.log("Delete method executed.");

  // Verify deletion of booking itself
  const checkBooking = await storage.getBooking(booking.id);
  if (!checkBooking) {
    console.log("✅ Booking successfully deleted from database.");
  } else {
    console.error("❌ Booking still exists in database after delete!");
    process.exit(1);
  }

  // Verify traveler deletion
  const checkTravelers = await storage.getTravelers(booking.id);
  if (checkTravelers.length === 0) {
    console.log("✅ Associated Travelers successfully deleted (Cascade OK).");
  } else {
    console.error(`❌ Travelers still exist in database for deleted booking:`, checkTravelers);
    process.exit(1);
  }

  // Verify payment deletion
  const checkPayments = await storage.getPayments(booking.id);
  if (checkPayments.length === 0) {
    console.log("✅ Associated Payments successfully deleted (Cascade OK).");
  } else {
    console.error(`❌ Payments still exist in database for deleted booking:`, checkPayments);
    process.exit(1);
  }

  // Verify document deletion
  const checkDocuments = await storage.getDocuments(booking.id);
  if (checkDocuments.length === 0) {
    console.log("✅ Associated Documents successfully deleted (Cascade OK).");
  } else {
    console.error(`❌ Documents still exist in database for deleted booking:`, checkDocuments);
    process.exit(1);
  }

  console.log("\n🎉 [SUCCESS] All Booking CRUD & Manual Cascade Delete operations are fully working!");
  process.exit(0);
}

verifyBookingCRUD().catch(err => {
  console.error("❌ Verification failed with error:", err);
  process.exit(1);
});
