/**
 * Pure billing/lifecycle classification for the phone-call channel.
 *
 * The single business rule lives here so it can be tested without Twilio or a
 * database: **only the therapist leg decides billing**, and an answer by any
 * party (person, receptionist, IVR, answering machine or voicemail) is a
 * billable answer exactly once. Call duration is irrelevant after an answer.
 */

export type TwilioCallStatus =
  | "queued"
  | "initiated"
  | "ringing"
  | "in-progress"
  | "answered"
  | "completed"
  | "busy"
  | "no-answer"
  | "failed"
  | "canceled";

export const NON_BILLABLE_TERMINAL_STATUSES = ["busy", "no-answer", "failed", "canceled"] as const;

/** Statuses that prove the therapist leg was picked up by *something*. */
const ANSWERED_STATUSES = ["answered", "in-progress", "completed"] as const;

/**
 * Does this therapist-leg callback prove an answer?
 *
 * `completed` counts because Twilio reports busy/no-answer/failed/canceled with
 * those exact statuses instead; a terminal `completed` therefore authoritatively
 * means the leg had been answered, and acts as an idempotent fallback for a
 * missing or late `answered` callback.
 */
export function therapistLegAnswered(status: string): boolean {
  return (ANSWERED_STATUSES as readonly string[]).includes(status);
}

/** Terminal outcomes that must never bill. */
export function therapistLegNonBillableTerminal(status: string): boolean {
  return (NON_BILLABLE_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Billing decision for one signed callback.
 *
 * `leg: "caller"` is never billable — a visitor answer (or a parent-call
 * `completed` event) is never proof that the therapist leg answered.
 */
export function isBillableCallback(input: {
  leg: "caller" | "therapist";
  status: string;
  alreadyBilled: boolean;
}): boolean {
  if (input.leg !== "therapist") return false;
  if (input.alreadyBilled) return false;
  return therapistLegAnswered(input.status);
}

/** Sanitize a provider error for storage: category/code only, never PII. */
export function sanitizeProviderError(code: unknown): string {
  const text = typeof code === "string" || typeof code === "number" ? String(code) : "unknown";
  const safe = text.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64);
  return safe || "unknown";
}
