/**
 * ─────────────────────────────────────────────────────────────────
 *  TourOps – Email Queue
 *  In-memory background job queue for email delivery.
 *  Features:
 *    - Fire-and-forget: API responses are never blocked.
 *    - Auto-retry with exponential backoff (up to MAX_RETRIES).
 *    - Per-job status tracking (pending → sending → sent/failed).
 *    - Dev-mode console fallback (no SMTP needed locally).
 *    - Graceful shutdown support.
 * ─────────────────────────────────────────────────────────────────
 */

export type JobStatus = "pending" | "sending" | "sent" | "failed";

export interface EmailJob {
  id: string;
  to: string;
  subject: string;
  html: string;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  createdAt: Date;
  lastAttemptAt?: Date;
  error?: string;
}

type SendFn = (job: Pick<EmailJob, "to" | "subject" | "html">) => Promise<void>;

const MAX_RETRIES = 3;
// Backoff delays in ms: 1st retry → 5s, 2nd → 30s, 3rd → 120s
const RETRY_DELAYS = [5_000, 30_000, 120_000];
const PROCESS_INTERVAL_MS = 2_000; // poll queue every 2 seconds

let jobIdCounter = 0;
const queue: EmailJob[] = [];
let sendFn: SendFn | null = null;
let processorTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

// ── Stats ────────────────────────────────────────────────────────
const stats = { sent: 0, failed: 0, pending: 0 };

function nextId(): string {
  return `eq-${Date.now()}-${++jobIdCounter}`;
}

// ── Init ─────────────────────────────────────────────────────────
/**
 * Call once at server startup to wire in the real send function.
 * In dev mode (no SMTP), pass the console-log fallback.
 */
export function initEmailQueue(fn: SendFn): void {
  sendFn = fn;
  if (!processorTimer) {
    processorTimer = setInterval(processQueue, PROCESS_INTERVAL_MS);
    console.log("[EmailQueue] Started – polling every", PROCESS_INTERVAL_MS, "ms");
  }
}

// ── Enqueue ──────────────────────────────────────────────────────
/**
 * Add an email job to the queue. Returns immediately (non-blocking).
 */
export function enqueueEmail(to: string, subject: string, html: string): string {
  const job: EmailJob = {
    id: nextId(),
    to,
    subject,
    html,
    attempts: 0,
    maxAttempts: MAX_RETRIES,
    status: "pending",
    createdAt: new Date(),
  };
  queue.push(job);
  stats.pending++;
  console.log(`[EmailQueue] Enqueued job ${job.id} → ${to} | "${subject}"`);
  return job.id;
}

// ── Processor ────────────────────────────────────────────────────
async function processQueue(): Promise<void> {
  if (isProcessing || !sendFn) return;
  isProcessing = true;

  try {
    const now = Date.now();
    // Find jobs that are pending and ready to send (respecting retry delay)
    const ready = queue.filter((job) => {
      if (job.status !== "pending") return false;
      if (job.attempts === 0) return true; // First attempt – send immediately
      // Retry: check if enough time has passed since last attempt
      const delay = RETRY_DELAYS[job.attempts - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
      return job.lastAttemptAt
        ? now - job.lastAttemptAt.getTime() >= delay
        : true;
    });

    for (const job of ready) {
      job.status = "sending";
      job.attempts++;
      job.lastAttemptAt = new Date();

      try {
        await sendFn({ to: job.to, subject: job.subject, html: job.html });
        job.status = "sent";
        stats.sent++;
        stats.pending = Math.max(0, stats.pending - 1);
        console.log(`[EmailQueue] ✓ Sent job ${job.id} (attempt ${job.attempts}) → ${job.to}`);
        // Remove from queue after a short grace period so it's inspectable
        setTimeout(() => {
          const idx = queue.indexOf(job);
          if (idx !== -1) queue.splice(idx, 1);
        }, 60_000);
      } catch (err: any) {
        job.error = err?.message ?? String(err);
        if (job.attempts >= job.maxAttempts) {
          job.status = "failed";
          stats.failed++;
          stats.pending = Math.max(0, stats.pending - 1);
          console.error(
            `[EmailQueue] ✗ FAILED job ${job.id} after ${job.attempts} attempts → ${job.to}`,
            err
          );
        } else {
          // Reset to pending so it gets retried
          job.status = "pending";
          const nextDelay = RETRY_DELAYS[job.attempts - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
          console.warn(
            `[EmailQueue] ↺ Retry scheduled for job ${job.id} (attempt ${job.attempts}/${job.maxAttempts}) in ${nextDelay / 1000}s`
          );
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

// ── Diagnostics ──────────────────────────────────────────────────
export function getQueueStats() {
  return {
    ...stats,
    queueLength: queue.length,
    jobs: queue.map((j) => ({
      id: j.id,
      to: j.to,
      subject: j.subject,
      status: j.status,
      attempts: j.attempts,
      createdAt: j.createdAt,
      lastAttemptAt: j.lastAttemptAt,
      error: j.error,
    })),
  };
}

// ── Graceful shutdown ─────────────────────────────────────────────
export function shutdownEmailQueue(): void {
  if (processorTimer) {
    clearInterval(processorTimer);
    processorTimer = null;
    console.log("[EmailQueue] Stopped.");
  }
}
