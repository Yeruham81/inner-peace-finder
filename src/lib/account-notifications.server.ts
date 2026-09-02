import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AccountNotificationKind = "credential_status";

type NotificationContent = {
  accountId: string;
  entityKey: string;
  kind: AccountNotificationKind;
  recipientName?: string | null;
  subject: string;
  title: string;
  paragraphs: string[];
  actionLabel: string;
  actionPath: string;
};

function publicOrigin(): string {
  const configured = process.env.TIPULINKS_PUBLIC_ORIGIN || "https://tipulinks.co.il";
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
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

function notificationHtml(content: NotificationContent): string {
  const name = escapeHtml(content.recipientName?.trim() || "שלום");
  const title = escapeHtml(content.title);
  const paragraphs = content.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const actionUrl = escapeHtml(`${publicOrigin()}${content.actionPath}`);
  const actionLabel = escapeHtml(content.actionLabel);
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#18302b;line-height:1.75">
    <h1 style="font-size:24px;margin:0 0 16px">${title}</h1>
    <p>${name},</p>
    ${paragraphs}
    <p style="margin:28px 0;text-align:center">
      <a href="${actionUrl}" style="display:inline-block;background:#2d8074;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700">${actionLabel}</a>
    </p>
  </div>`;
}

async function sendAccountNotification(content: NotificationContent): Promise<boolean> {
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_account_notification", {
    _account_id: content.accountId,
    _notification_kind: content.kind,
    _entity_key: content.entityKey,
  });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return false;

  try {
    const { data: account, error: accountError } = await supabaseAdmin
      .from("therapist_accounts")
      .select("auth_user_id")
      .eq("id", content.accountId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new Error("account_not_found");

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(account.auth_user_id);
    if (authError) throw new Error(authError.message);
    const email = authData.user?.email;
    if (!email) throw new Error("account_email_missing");

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("brevo_not_configured");
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: process.env.EMAIL_FROM_NAME || "Tipulinks",
          email: process.env.EMAIL_FROM_ADDRESS || "notifications@tipulinks.co.il",
        },
        to: [{ email, ...(content.recipientName ? { name: content.recipientName } : {}) }],
        subject: content.subject,
        htmlContent: notificationHtml(content),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      messageId?: string;
      message?: string;
    } | null;
    if (!response.ok) throw new Error(body?.message ?? `brevo_${response.status}`);

    await supabaseAdmin.rpc("finish_account_notification", {
      _account_id: content.accountId,
      _notification_kind: content.kind,
      _entity_key: content.entityKey,
      _success: true,
      _provider_message_id: body?.messageId ?? (null as unknown as string),
      _error: null as unknown as string,
    });
    return true;
  } catch (error) {
    await supabaseAdmin.rpc("finish_account_notification", {
      _account_id: content.accountId,
      _notification_kind: content.kind,
      _entity_key: content.entityKey,
      _success: false,
      _provider_message_id: null as unknown as string,
      _error: error instanceof Error ? error.message : "unknown_error",
    });
    throw error;
  }
}

export async function sendCredentialStatusNotification(args: {
  accountId: string;
  credentialId: string;
  notificationKey: string;
  therapistName: string;
  credentialType: string;
  approved: boolean;
  rejectionReason?: string | null;
}): Promise<boolean> {
  const paragraphs = args.approved
    ? [`ההסמכה „${args.credentialType}” נבדקה ואושרה.`]
    : [
        `ההסמכה „${args.credentialType}” נבדקה ונדרשת פעולה נוספת.`,
        ...(args.rejectionReason ? [`סיבת הדחייה: ${args.rejectionReason}`] : []),
      ];
  return sendAccountNotification({
    accountId: args.accountId,
    entityKey: `${args.credentialId}:${args.notificationKey}`,
    kind: "credential_status",
    recipientName: args.therapistName,
    subject: args.approved ? "ההסמכה שלך אומתה בטיפולינקס" : "נדרש עדכון להסמכה בטיפולינקס",
    title: args.approved ? "ההסמכה אומתה" : "נדרש עדכון להסמכה",
    paragraphs,
    actionLabel: "לצפייה בהסמכות",
    actionPath: "/account/credentials",
  });
}
