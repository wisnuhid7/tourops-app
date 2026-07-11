import { db } from './server/db'; 
async function getBooking() { 
  const b = await db.query.bookings.findFirst({where: (b, {eq}) => eq(b.id, '9f096297-3b67-46d7-a522-336ce9c8b032')}); 
  console.log(b); 
  process.exit(0); 
} 
getBooking();
