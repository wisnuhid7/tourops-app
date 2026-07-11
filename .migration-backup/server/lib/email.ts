/**
 * ─────────────────────────────────────────────────────────────────
 *  TourOps – Email Module
 *  Responsibilities:
 *    1. Configure & expose the Nodemailer transporter.
 *    2. Provide a clean HTML template builder.
 *    3. Export typed notification functions that push jobs to the
 *       email queue (non-blocking) via `enqueueEmail`.
 *
 *  Usage:
 *    import { initEmailSystem } from "./lib/email";
 *    initEmailSystem();  // call once at server startup
 * ─────────────────────────────────────────────────────────────────
 */

import nodemailer from "nodemailer";
import { type Booking } from "@shared/schema";
import { initEmailQueue, enqueueEmail } from "./emailQueue";

// ── Transporter ──────────────────────────────────────────────────
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

// ── Init (call once at startup) ───────────────────────────────────
export function initEmailSystem(): void {
  initEmailQueue(async ({ to, subject, html }) => {
    if (transporter) {
      await transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || "TourOps"}" <${process.env.SMTP_FROM_EMAIL || "no-reply@tourops.com"}>`,
        to,
        subject,
        html,
      });
    } else {
      // Dev-mode: pretty console output instead of real SMTP
      console.log("\n╔════════════════════════════════════════════════╗");
      console.log("║         [DEV] EMAIL NOTIFICATION               ║");
      console.log("╠════════════════════════════════════════════════╣");
      console.log(`  To      : ${to}`);
      console.log(`  Subject : ${subject}`);
      console.log("╚════════════════════════════════════════════════╝\n");
    }
  });
}

// ── Template Builder ─────────────────────────────────────────────
const PRIMARY = "#116bb0";
const APP_URL = () => process.env.APP_URL || "http://localhost:5000";
const YEAR = new Date().getFullYear();

function buildLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f4f8; color: #333; padding: 20px 0; }
    .wrapper { max-width: 620px; margin: 0 auto; }
    .card { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    /* Header */
    .header { background: linear-gradient(135deg, ${PRIMARY} 0%, #0d8a8a 100%); padding: 32px 40px; text-align: center; }
    .header-logo { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: 2px; }
    .header-tagline { font-size: 12px; color: rgba(255,255,255,0.75); margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; }
    /* Body */
    .body { padding: 40px; }
    .title { font-size: 22px; font-weight: 700; color: ${PRIMARY}; margin-bottom: 16px; line-height: 1.3; }
    .text { font-size: 14px; color: #555; line-height: 1.7; margin-bottom: 12px; }
    /* Info Box */
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${PRIMARY}; border-radius: 0 8px 8px 0; padding: 20px 24px; margin: 20px 0; }
    .info-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; font-size: 14px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { font-weight: 600; color: #555; min-width: 130px; flex-shrink: 0; }
    .info-value { color: #222; }
    /* Code (join code) */
    .join-code { font-family: 'Courier New', monospace; font-weight: 800; font-size: 22px; color: ${PRIMARY}; letter-spacing: 4px; background: #eff6ff; border: 2px dashed ${PRIMARY}; border-radius: 8px; padding: 8px 16px; display: inline-block; margin-top: 4px; }
    /* CTA Button */
    .btn-wrap { text-align: center; margin: 28px 0 12px; }
    .btn { display: inline-block; background: ${PRIMARY}; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; }
    /* Badge */
    .badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-red   { background: #fee2e2; color: #b91c1c; }
    .badge-blue  { background: #dbeafe; color: #1d4ed8; }
    /* Divider */
    .divider { border: none; border-top: 1px solid #e8edf2; margin: 24px 0; }
    /* Footer */
    .footer { background: #f8fafc; border-top: 1px solid #e8edf2; padding: 24px 40px; text-align: center; }
    .footer-text { font-size: 12px; color: #94a3b8; line-height: 1.8; }
    .footer-brand { font-weight: 700; color: #64748b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="header-logo">✈ TourOps</div>
        <div class="header-tagline">Tour Operations Management</div>
      </div>
      <div class="body">
        <h1 class="title">${title}</h1>
        ${content}
      </div>
      <div class="footer">
        <p class="footer-text">
          <span class="footer-brand">TourOps Software</span><br>
          &copy; ${YEAR} All rights reserved.<br>
          Ini adalah email otomatis. Mohon tidak membalas langsung ke email ini.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function infoRow(label: string, value: string): string {
  return `<div class="info-row"><span class="info-label">${label}</span><span class="info-value">${value}</span></div>`;
}

// ── Notification Functions ────────────────────────────────────────
// All functions enqueue the job and return immediately.
// The actual send happens asynchronously via the queue.

export function sendNewBookingNotification(
  adminEmail: string,
  booking: Booking,
  customerName: string
): void {
  const content = `
    <p class="text">Halo Admin,</p>
    <p class="text">Ada pesanan tour baru yang masuk dan memerlukan peninjauan Anda.</p>
    <div class="info-box">
      ${infoRow("Kode Booking", `<strong>${booking.bookingCode}</strong>`)}
      ${infoRow("Customer", customerName)}
      ${infoRow("Tipe Booking", `<span class="badge badge-blue">${booking.bookingType.replace(/_/g, " ").toUpperCase()}</span>`)}
      ${infoRow("Jumlah Pax", String(booking.partySizeExpected ?? 1))}
    </div>
    <div class="btn-wrap">
      <a href="${APP_URL()}/admin/bookings/${booking.id}" class="btn">Lihat Detail Booking →</a>
    </div>`;

  enqueueEmail(
    adminEmail,
    `[Booking Baru] ${booking.bookingCode} – ${customerName}`,
    buildLayout("Booking Baru Menunggu Peninjauan", content)
  );
}

export function sendBookingConfirmedNotification(
  customerEmail: string,
  booking: Booking
): void {
  const joinCodeHtml = booking.joinCode
    ? `${infoRow("Join Code Grup", `<div class="join-code">${booking.joinCode}</div>`)}`
    : "";

  const content = `
    <p class="text">Halo,</p>
    <p class="text">
      Kabar gembira! 🎉 Pesanan tour Anda telah resmi <strong>Dikonfirmasi</strong>.
      Tim operasional kami sedang mempersiapkan segala kebutuhan perjalanan Anda.
    </p>
    <div class="info-box">
      ${infoRow("Kode Booking", `<strong>${booking.bookingCode}</strong>`)}
      ${infoRow("Status", '<span class="badge badge-green">CONFIRMED</span>')}
      ${joinCodeHtml}
    </div>
    ${booking.joinCode ? `<p class="text" style="font-size:13px;color:#64748b;">Bagikan <strong>Join Code</strong> di atas kepada rekan yang ingin bergabung ke dalam grup perjalanan yang sama.</p>` : ""}
    <div class="btn-wrap">
      <a href="${APP_URL()}/my-bookings/${booking.id}" class="btn">Buka Portal Customer →</a>
    </div>`;

  enqueueEmail(
    customerEmail,
    `✈️ Booking Dikonfirmasi: ${booking.bookingCode}`,
    buildLayout("Booking Anda Telah Dikonfirmasi!", content)
  );
}

export function sendAssignmentNotification(
  staffEmail: string,
  serviceType: string,
  bookingCode: string,
  workflowId: string
): void {
  const serviceLabel = serviceType.toUpperCase();
  const content = `
    <p class="text">Halo,</p>
    <p class="text">Anda telah ditugaskan untuk menangani komponen layanan berikut ini.</p>
    <div class="info-box">
      ${infoRow("Layanan", `<span class="badge badge-blue">${serviceLabel}</span>`)}
      ${infoRow("Kode Booking", `<strong>${bookingCode}</strong>`)}
      ${infoRow("Prioritas", '<span class="badge badge-green">NORMAL</span>')}
    </div>
    <p class="text">Mohon segera lakukan peninjauan dan perbarui langkah-langkah workflow sesuai perkembangan di lapangan.</p>
    <div class="btn-wrap">
      <a href="${APP_URL()}/admin/workflows/${workflowId}" class="btn">Proses Penugasan →</a>
    </div>`;

  enqueueEmail(
    staffEmail,
    `📋 Penugasan: ${serviceLabel} (${bookingCode})`,
    buildLayout("Penugasan Layanan Baru", content)
  );
}

export function sendDocumentStatusNotification(
  customerEmail: string,
  bookingCode: string,
  docType: string,
  status: string,
  notes?: string
): void {
  const isApproved = status === "approved";
  const badgeClass = isApproved ? "badge-green" : "badge-red";
  const statusLabel = isApproved ? "DISETUJUI" : "DITOLAK";
  const notesHtml = notes
    ? `<hr class="divider"><p class="text"><strong>Catatan dari Admin:</strong><br><em style="color:#64748b;">"${notes}"</em></p>`
    : "";
  const actionHtml = !isApproved
    ? `<p class="text" style="color:#b91c1c;">Mohon segera unggah kembali dokumen yang benar melalui portal customer agar proses booking tidak terhambat.</p>`
    : "";

  const content = `
    <p class="text">Halo,</p>
    <p class="text">Kami telah meninjau dokumen yang Anda unggah untuk booking <strong>${bookingCode}</strong>.</p>
    <div class="info-box">
      ${infoRow("Dokumen", docType.replace(/_/g, " ").toUpperCase())}
      ${infoRow("Status", `<span class="badge ${badgeClass}">${statusLabel}</span>`)}
    </div>
    ${notesHtml}
    ${actionHtml}
    <div class="btn-wrap">
      <a href="${APP_URL()}/my-bookings" class="btn">Buka Portal Customer →</a>
    </div>`;

  enqueueEmail(
    customerEmail,
    `${isApproved ? "✅" : "❌"} Update Dokumen: ${docType.toUpperCase()} (${bookingCode})`,
    buildLayout("Pembaruan Status Dokumen", content)
  );
}

export function sendPaymentStatusNotification(
  customerEmail: string,
  bookingCode: string,
  amount: string,
  currency: string
): void {
  const content = `
    <p class="text">Halo,</p>
    <p class="text">Kami telah menerima dan mengonfirmasi pembayaran Anda untuk booking <strong>${bookingCode}</strong>.</p>
    <div class="info-box">
      ${infoRow("Jumlah", `<strong>${currency} ${Number(amount).toLocaleString("id-ID")}</strong>`)}
      ${infoRow("Status", '<span class="badge badge-green">LUNAS / PAID</span>')}
    </div>
    <p class="text">Terima kasih atas pembayaran Anda. Anda dapat melihat riwayat pembayaran lengkap di portal customer.</p>
    <div class="btn-wrap">
      <a href="${APP_URL()}/my-bookings" class="btn">Lihat Detail Pembayaran →</a>
    </div>`;

  enqueueEmail(
    customerEmail,
    `💰 Pembayaran Diterima: ${bookingCode}`,
    buildLayout("Konfirmasi Pembayaran Diterima", content)
  );
}
