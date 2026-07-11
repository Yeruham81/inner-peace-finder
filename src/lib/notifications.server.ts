/**
 * Notification delivery worker. Reads pending rows from
 * `notification_events`, resolves the recipient email, renders a Hebrew
 * template, and sends it via Brevo transactional email API.
 *
 * Called opportunistically (right after a claim request is inserted or its
 * status is updated). Safe to run repeatedly; each row is claimed with a
 * status flip to `sending` before delivery.
 *
 * Server-only. Do NOT import from client-reachable modules at module scope —
 * only load inside server-function handlers via dynamic import().
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type EventType =
  | "request_submitted"
  | "request_approved"
  | "request_rejected"
  | "request_needs_information";

const FROM_NAME = process.env.EMAIL_FROM_NAME || "Tipulinks";
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || "notifications@tipulinks.co.il";
const BREVO_KEY = process.env.BREVO_API_KEY;

type EventRow = {
  id: string;
  event_type: string;
  claim_request_id: string | null;
  recipient_account_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

export async function deliverPendingNotifications(limit = 20): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const { data: rows } = await supabaseAdmin
    .from("notification_events")
    .select("id, event_type, claim_request_id, recipient_account_id, payload, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!rows || rows.length === 0) return stats;

  for (const raw of rows as EventRow[]) {
    stats.processed += 1;
    // Claim row (best-effort optimistic lock)
    const { data: claimed } = await supabaseAdmin
      .from("notification_events")
      .update({ status: "sending", attempts: raw.attempts + 1 })
      .eq("id", raw.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const outcome = await deliverOne(raw);
      if (outcome === "sent") {
        stats.sent += 1;
        await supabaseAdmin
          .from("notification_events")
          .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
          .eq("id", raw.id);
      } else {
        stats.skipped += 1;
        await supabaseAdmin
          .from("notification_events")
          .update({ status: "skipped", last_error: outcome })
          .eq("id", raw.id);
      }
    } catch (err) {
      stats.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("notification_events")
        .update({ status: "pending", last_error: msg })
        .eq("id", raw.id);
    }
  }
  return stats;
}

async function deliverOne(row: EventRow): Promise<"sent" | string> {
  if (!BREVO_KEY) return "brevo_not_configured";
  if (!row.recipient_account_id) return "no_recipient_account";

  const { data: account } = await supabaseAdmin
    .from("therapist_accounts")
    .select("auth_user_id")
    .eq("id", row.recipient_account_id)
    .maybeSingle();
  if (!account?.auth_user_id) return "account_not_found";

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(account.auth_user_id);
  const email = authUser?.user?.email;
  if (!email) return "no_email";

  let therapistName: string | null = null;
  if (row.claim_request_id) {
    const { data: cr } = await supabaseAdmin
      .from("therapist_claim_requests")
      .select("therapist_id, request_type, verification_method")
      .eq("id", row.claim_request_id)
      .maybeSingle();
    if (cr?.therapist_id) {
      const { data: t } = await supabaseAdmin
        .from("therapists")
        .select("full_name")
        .eq("id", cr.therapist_id)
        .maybeSingle();
      therapistName = t?.full_name ?? null;
    }
  }

  const tmpl = buildTemplate(row.event_type as EventType, {
    therapistName,
    requestType: (row.payload?.request_type as string) ?? "claim_profile",
    verificationMethod: (row.payload?.verification_method as string) ?? "",
  });

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_ADDRESS },
      to: [{ email }],
      subject: tmpl.subject,
      htmlContent: tmpl.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`brevo ${res.status}: ${body.slice(0, 500)}`);
  }
  return "sent";
}

function buildTemplate(
  event: EventType,
  ctx: { therapistName: string | null; requestType: string; verificationMethod: string },
): { subject: string; html: string } {
  const rtLabel = ctx.requestType === "remove_profile"
    ? "בקשה להסרת הפרופיל"
    : "שיוך פרופיל מטפל";
  const vmLabel: Record<string, string> = {
    license_number: "מספר רישיון מקצועי",
    professional_email: "כתובת מייל מקצועית",
    manual_review: "בדיקה ידנית של הצוות",
  };
  const who = ctx.therapistName ? ` (${ctx.therapistName})` : "";

  const wrap = (title: string, body: string) => ({
    subject: title,
    html: `<div dir="rtl" style="font-family:system-ui,Arial,sans-serif;line-height:1.7;color:#111">
      <h2 style="margin:0 0 12px">${title}</h2>
      ${body}
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
      <p style="color:#666;font-size:13px">הודעה זו נשלחה אוטומטית ממערכת Tipulinks. אין להשיב למייל זה.</p>
    </div>`,
  });

  switch (event) {
    case "request_submitted":
      return wrap(`הבקשה שלכם התקבלה — ${rtLabel}`,
        `<p>קיבלנו את בקשתכם עבור${who}.</p>
         <p><strong>סוג בקשה:</strong> ${rtLabel}<br/>
            <strong>שיטת אימות:</strong> ${vmLabel[ctx.verificationMethod] ?? ctx.verificationMethod}</p>
         <p>צוות האתר יבדוק את הפרטים. תהליך האימות עשוי להימשך עד 24 שעות.</p>`);
    case "request_approved":
      return wrap(`הבקשה אושרה — ${rtLabel}`,
        `<p>הבקשה עבור${who} אושרה.</p>
         <p>ניתן להתחבר לחשבון ולראות את המצב המעודכן.</p>`);
    case "request_rejected":
      return wrap(`הבקשה נדחתה — ${rtLabel}`,
        `<p>לצערנו הבקשה עבור${who} נדחתה.</p>
         <p>לפרטים נוספים ניתן לפנות אלינו בתשובה למייל זה.</p>`);
    case "request_needs_information":
      return wrap(`נדרש מידע נוסף — ${rtLabel}`,
        `<p>כדי להמשיך בבדיקת הבקשה עבור${who} אנו זקוקים למידע נוסף.</p>
         <p>אנא היכנסו לחשבון ובדקו את פרטי הבקשה, או השיבו למייל זה.</p>`);
  }
}