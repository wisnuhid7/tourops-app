/**
 * Simulation of SMS/WhatsApp messaging triggers.
 * In a real-world scenario, this would integrate with Twilio, MessageBird, or similar.
 */

export async function sendWhatsApp(to: string, message: string) {
  console.log(`[WhatsApp Simulation] Sending to ${to}: ${message}`);
  // In reality: await twilio.messages.create({ body: message, from: 'whatsapp:+1...', to: `whatsapp:${to}` });
  return true;
}

export async function sendSMS(to: string, message: string) {
  console.log(`[SMS Simulation] Sending to ${to}: ${message}`);
  // In reality: await twilio.messages.create({ body: message, from: '+1...', to });
  return true;
}

export const MESSAGE_TEMPLATES = {
  BOOKING_CONFIRMED: (name: string, code: string) => 
    `Hello ${name}, your booking ${code} has been confirmed! We're excited to have you on board.`,
  PAYMENT_RECEIVED: (amount: string, currency: string) => 
    `We've received your payment of ${currency} ${amount}. Thank you!`,
  TASK_ASSIGNED: (task: string) => 
    `New task assigned: ${task}. Please check your dashboard for details.`,
};
