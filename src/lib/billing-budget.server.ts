import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ClaimedBudgetNotification = {
  notification_id: string;
  auth_user_id: string;
  therapist_name: string;
  monthly_limit_agorot: number;
  spent_agorot: number;
  month_start: string;
};

function publicOrigin(): string {
  const configured = process.env.TIPULINKS_PUBLIC_ORIGIN || "https://tipulinks.co.il";
  const parsed = new URL(configured);
  if (
    parsed.protocol !== "https:" &&
    parsed.hostname !== "localhost" &&
    parsed.hostname !== "127.0.0.1"
  ) {
    throw new Error("TIPULINKS_PUBLIC_ORIGIN must use https");
  }
  return parsed.origin;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shekels(agorot: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}

function notificationHtml(notification: ClaimedBudgetNotification, billingUrl: string): string {
  const name = escapeHtml(notification.therapist_name || "שלום");
  const limit = escapeHtml(shekels(notification.monthly_limit_agorot));
  const spent = escapeHtml(shekels(notification.spent_agorot));
  const url = escapeHtml(billingUrl);
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18302b;line-height:1.75">
    <h1 style="font-size:24px;margin:0 0 16px">הפרופיל הושהה עקב הגעה לתקרת התקציב</h1>
    <p>שלום ${name},</p>
    <p>התקציב החודשי שהוגדר לפרסום בטיפולינקס נוצל, ולכן הפרופיל אינו מוצג כרגע בתוצאות החיפוש.</p>
    <p><strong>תקרת התקציב:</strong> ${limit}<br /><strong>חיוב החודש:</strong> ${spent}</p>
    <p>הפרופיל יחזור להופיע אוטומטית בתחילת החודש הקלנדרי הבא. ניתן להגדיל כעת את התקציב כדי לחדש את החשיפה מוקדם יותר.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${url}" style="display:inline-block;background:#2d8074;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700">לעדכון התקציב החודשי</a>
    </p>
  </div>`;
}

export async function sendBudgetExhaustedNotification(therapistId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("claim_monthly_budget_notification", {
    _therapist_id: therapistId,
  });
  if (error) throw new Error(error.message);
  if (!data) return false;
  const notification = data as unknown as ClaimedBudgetNotification;

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      notification.auth_user_id,
    );
    if (authError) throw new Error(authError.message);
    const email = authData.user?.email;
    if (!email) throw new Error("account_email_missing");

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("brevo_not_configured");
    const senderName = process.env.EMAIL_FROM_NAME || "Tipulinks";
    const senderEmail = process.env.EMAIL_FROM_ADDRESS || "notifications@tipulinks.co.il";
    const billingUrl = `${publicOrigin()}/account/billing`;
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email, name: notification.therapist_name }],
        subject: "הפרופיל שלך הגיע לתקרת התקציב החודשי",
        htmlContent: notificationHtml(notification, billingUrl),
      }),
    });
    const providerBody = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) throw new Error(providerBody?.message ?? `brevo_${response.status}`);

    await supabaseAdmin.rpc("finish_monthly_budget_notification", {
      _notification_id: notification.notification_id,
      _success: true,
      _error: null as unknown as string,
    });
    return true;
  } catch (sendError) {
    await supabaseAdmin.rpc("finish_monthly_budget_notification", {
      _notification_id: notification.notification_id,
      _success: false,
      _error: sendError instanceof Error ? sendError.message : "unknown_error",
    });
    throw sendError;
  }
}
