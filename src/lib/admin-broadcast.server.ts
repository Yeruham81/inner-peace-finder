import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  ActiveSiteAnnouncement,
  AdminBroadcastCampaignRow,
  BroadcastAudience,
  BroadcastAudiencePreview,
  BroadcastAudienceRecipient,
  BroadcastCategory,
  BroadcastChannel,
  SiteAnnouncementDisplayType,
} from "./admin-broadcast.types";
import { normalizeBrevoEmailEvent } from "./lead-delivery.server";

const BROADCAST_TAG_PREFIX = "tipulinks_broadcast_";
const BREVO_BASE_URL = "https://api.brevo.com/v3";
const BREVO_MAX_BATCH_VERSIONS = 500;
const BREVO_SCHEDULE_LIMIT_MS = 72 * 60 * 60 * 1000;
const BREVO_LIST_CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type ResolvedAudience = BroadcastAudienceRecipient[];

type BroadcastContent = {
  category: BroadcastCategory;
  title: string;
  emailSubject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export type CreateBroadcastArgs = BroadcastContent & {
  clientRequestId: string;
  channels: BroadcastChannel[];
  siteDisplayType: SiteAnnouncementDisplayType | null;
  audience: BroadcastAudience;
  scheduledAt: string | null;
  expiresAt: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizedActionUrl(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("/")) {
    const origin = new URL(process.env.TIPULINKS_PUBLIC_ORIGIN || "https://tipulinks.co.il").origin;
    return new URL(raw, origin).toString();
  }
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") throw new Error("קישור בהודעה חייב להשתמש ב-HTTPS.");
  return parsed.toString();
}

function renderBroadcastHtml(content: BroadcastContent): string {
  const body = content.body
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(paragraph.trim())}</p>`)
    .join("");
  const actionUrl = normalizedActionUrl(content.ctaUrl);
  const action =
    actionUrl && content.ctaLabel
      ? `<p style="margin:28px 0 4px;text-align:right"><a dir="rtl" href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#2d8074;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700">${escapeHtml(content.ctaLabel)}</a></p>`
      : "";
  const marketingFooter =
    content.category !== "operational"
      ? `<p dir="rtl" style="direction:rtl;text-align:right;margin:30px 0 0;padding-top:18px;border-top:1px solid #dce8e4;color:#687873;font-size:12px">אם אינך מעוניין/ת לקבל הודעות שיווקיות נוספות מטיפולינקס, ניתן <a href="{{ unsubscribe }}" style="color:#2d8074">להסיר את כתובתך כאן</a>.</p>`
      : "";
  return `<div dir="rtl" style="direction:rtl;text-align:right;font-family:Arial,'Heebo',sans-serif;max-width:640px;margin:0 auto;color:#18302b;line-height:1.8">
    <h1 dir="rtl" style="direction:rtl;text-align:right;font-size:24px;margin:0 0 18px">${escapeHtml(content.title)}</h1>
    <div dir="rtl" style="direction:rtl;text-align:right">${body}</div>
    ${action}
    ${marketingFooter}
  </div>`;
}

function renderBroadcastText(content: BroadcastContent): string {
  const parts = [content.title, "", content.body];
  const actionUrl = normalizedActionUrl(content.ctaUrl);
  if (actionUrl && content.ctaLabel) parts.push("", `${content.ctaLabel}: ${actionUrl}`);
  return parts.join("\n");
}

async function listAllAuthUsers() {
  const users: Array<{
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }> = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

function metadataDisplayName(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  for (const key of ["full_name", "name", "display_name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function resolveBroadcastAudience(audience: BroadcastAudience): Promise<ResolvedAudience> {
  const [authUsers, accountsResult, therapistsResult, credentialsResult] = await Promise.all([
    listAllAuthUsers(),
    supabaseAdmin
      .from("therapist_accounts")
      .select("id, auth_user_id, onboarding_completed, payment_method_status"),
    supabaseAdmin.from("therapists").select("id, owner_account_id, full_name, profile_status, verified"),
    supabaseAdmin.from("therapist_credentials").select("therapist_id, verification_status"),
  ]);
  if (accountsResult.error) throw new Error(accountsResult.error.message);
  if (therapistsResult.error) throw new Error(therapistsResult.error.message);
  if (credentialsResult.error) throw new Error(credentialsResult.error.message);

  const accountsByUser = new Map((accountsResult.data ?? []).map((row) => [row.auth_user_id, row]));
  const therapistsByAccount = new Map<string, typeof therapistsResult.data>();
  for (const therapist of therapistsResult.data ?? []) {
    if (!therapist.owner_account_id) continue;
    const rows = therapistsByAccount.get(therapist.owner_account_id) ?? [];
    rows.push(therapist);
    therapistsByAccount.set(therapist.owner_account_id, rows);
  }
  const credentialStatusesByTherapist = new Map<string, Set<string>>();
  for (const credential of credentialsResult.data ?? []) {
    const statuses = credentialStatusesByTherapist.get(credential.therapist_id) ?? new Set<string>();
    statuses.add(credential.verification_status);
    credentialStatusesByTherapist.set(credential.therapist_id, statuses);
  }

  const recipients: ResolvedAudience = [];
  for (const user of authUsers) {
    const email = user.email?.trim().toLowerCase();
    if (!email) continue;
    const account = accountsByUser.get(user.id) ?? null;
    if (audience.scope === "therapists" && !account) continue;
    const ownedTherapists = account ? therapistsByAccount.get(account.id) ?? [] : [];

    if (audience.profileStatuses.length > 0) {
      if (!ownedTherapists.some((row) => audience.profileStatuses.includes(row.profile_status))) continue;
    }

    const hasVerified = ownedTherapists.some((row) => {
      if (row.verified) return true;
      return credentialStatusesByTherapist.get(row.id)?.has("verified") ?? false;
    });
    const hasPending = ownedTherapists.some((row) =>
      credentialStatusesByTherapist.get(row.id)?.has("pending_review"),
    );
    if (audience.verification === "verified" && !hasVerified) continue;
    if (audience.verification === "pending" && !hasPending) continue;
    if (audience.verification === "not_verified" && hasVerified) continue;

    if (audience.onboarding !== "any") {
      if (!account) continue;
      if (audience.onboarding === "completed" && !account.onboarding_completed) continue;
      if (audience.onboarding === "incomplete" && account.onboarding_completed) continue;
    }
    if (audience.payment !== "any") {
      if (!account) continue;
      const active = account.payment_method_status === "active";
      if (audience.payment === "active" && !active) continue;
      if (audience.payment === "missing" && active) continue;
    }

    const primaryTherapist = ownedTherapists.find((row) => row.profile_status === "published") ?? ownedTherapists[0] ?? null;
    recipients.push({
      authUserId: user.id,
      accountId: account?.id ?? null,
      email,
      displayName: primaryTherapist?.full_name?.trim() || metadataDisplayName(user.user_metadata) || null,
      profileStatus: primaryTherapist?.profile_status ?? null,
      verified: ownedTherapists.length > 0 ? hasVerified : null,
      verificationPending: hasPending,
      onboardingCompleted: account?.onboarding_completed ?? null,
      paymentMethodActive: account ? account.payment_method_status === "active" : null,
    });
  }

  return recipients.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, "he"));
}

export async function previewBroadcastAudience(
  audience: BroadcastAudience,
  category: BroadcastCategory,
): Promise<BroadcastAudiencePreview> {
  const recipients = await resolveBroadcastAudience(audience);
  return {
    totalCount: recipients.length,
    emailEligibleCount: recipients.length,
    siteEligibleCount: recipients.length,
    recipients: recipients.slice(0, 200),
    recipientsTruncated: recipients.length > 200,
  };
}

async function insertRecipients(
  campaignId: string,
  channel: "email" | "site",
  recipients: ResolvedAudience,
  status: "pending" | "active",
) {
  for (const rows of chunk(recipients, 500)) {
    const { error } = await supabaseAdmin.from("admin_broadcast_recipients").insert(
      rows.map((recipient) => ({
        campaign_id: campaignId,
        auth_user_id: recipient.authUserId,
        therapist_account_id: recipient.accountId,
        channel,
        email: recipient.email,
        display_name: recipient.displayName,
        status,
      })),
    );
    if (error) throw new Error(error.message);
  }
}

async function sendBrevoCampaign(
  campaignId: string,
  content: BroadcastContent,
  recipients: ResolvedAudience,
  scheduledAt: string | null,
): Promise<{ submitted: number; failed: number; error: string | null }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY אינו מוגדר.");
  const sender = {
    name: process.env.EMAIL_FROM_NAME || "Tipulinks",
    email: process.env.EMAIL_FROM_ADDRESS || "notifications@tipulinks.co.il",
  };
  const htmlContent = renderBroadcastHtml(content);
  const textContent = renderBroadcastText(content);
  let submitted = 0;
  let failed = 0;
  let lastError: string | null = null;
  let chunkIndex = 0;

  for (const recipientChunk of chunk(recipients, BREVO_MAX_BATCH_VERSIONS)) {
    chunkIndex += 1;
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        subject: content.emailSubject,
        htmlContent,
        textContent,
        tags: ["tipulinks_broadcast", `${BROADCAST_TAG_PREFIX}${campaignId}`],
        ...(scheduledAt ? { scheduledAt, batchId: campaignId } : {}),
        messageVersions: recipientChunk.map((recipient) => ({
          to: [{ email: recipient.email, ...(recipient.displayName ? { name: recipient.displayName } : {}) }],
        })),
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { messageId?: string; messageIds?: string[]; message?: string }
      | null;
    if (!response.ok) {
      const message = payload?.message ?? `brevo_${response.status}`;
      lastError = message;
      failed += recipientChunk.length;
      const { error } = await supabaseAdmin
        .from("admin_broadcast_recipients")
        .update({ status: "failed", failed_at: new Date().toISOString(), error: message, updated_at: new Date().toISOString() })
        .eq("campaign_id", campaignId)
        .eq("channel", "email")
        .in(
          "auth_user_id",
          recipientChunk.map((recipient) => recipient.authUserId),
        );
      if (error) throw new Error(error.message);
      continue;
    }

    const ids = payload?.messageIds ?? (payload?.messageId ? [payload.messageId] : []);
    const submittedAt = new Date().toISOString();
    for (let index = 0; index < recipientChunk.length; index += 1) {
      const recipient = recipientChunk[index]!;
      const providerId = ids.length === recipientChunk.length ? ids[index] : ids.length === 1 && recipientChunk.length === 1 ? ids[0] : null;
      const { error } = await supabaseAdmin
        .from("admin_broadcast_recipients")
        .update({
          status: "submitted",
          submitted_at: submittedAt,
          provider_message_id: providerId ?? null,
          error: null,
          updated_at: submittedAt,
        })
        .eq("campaign_id", campaignId)
        .eq("channel", "email")
        .eq("auth_user_id", recipient.authUserId);
      if (error) throw new Error(error.message);
    }
    submitted += recipientChunk.length;
  }

  return { submitted, failed, error: lastError };
}


function brevoApiKey(): string {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error("BREVO_API_KEY אינו מוגדר.");
  return apiKey;
}

async function brevoRequest(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BREVO_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "api-key": brevoApiKey(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function brevoJson(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

function broadcastMarketingFolderId(): number {
  // Reuse the already configured Marketing Campaigns folder by default. A
  // dedicated folder can be introduced later without changing application code.
  const raw = process.env.BREVO_BROADCAST_FOLDER_ID?.trim() || process.env.BREVO_RECRUITMENT_FOLDER_ID?.trim();
  const value = raw ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("BREVO_BROADCAST_FOLDER_ID או BREVO_RECRUITMENT_FOLDER_ID חייב להיות מוגדר עבור דיוור שיווקי.");
  }
  return value;
}

async function createBrevoBroadcastList(campaignId: string): Promise<number> {
  const response = await brevoRequest("/contacts/lists", {
    method: "POST",
    body: JSON.stringify({
      folderId: broadcastMarketingFolderId(),
      name: `Tipulinks broadcast ${campaignId}`,
    }),
  });
  const body = await brevoJson(response);
  if (!response.ok || !Number.isInteger(body?.id)) throw new Error(body?.message ?? `brevo_list_${response.status}`);
  return body.id;
}

async function deleteBrevoBroadcastList(campaignId: string, listId: number): Promise<boolean> {
  try {
    const response = await brevoRequest(`/contacts/lists/${listId}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const body = await brevoJson(response);
      console.warn("[broadcast] Brevo list cleanup failed", { campaignId, listId, status: response.status, message: body?.message });
      return false;
    }
    const { error } = await supabaseAdmin
      .from("admin_broadcast_campaigns")
      .update({ brevo_list_deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("brevo_list_id", listId);
    if (error) console.warn("[broadcast] failed to persist Brevo list cleanup", { campaignId, listId, code: error.code });
    return true;
  } catch (error) {
    console.warn("[broadcast] Brevo list cleanup failed", {
      campaignId,
      listId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

async function cleanupOldBrevoBroadcastLists(): Promise<void> {
  const cutoff = new Date(Date.now() - BREVO_LIST_CLEANUP_AGE_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .select("id,brevo_list_id")
    .in("status", ["sent", "partially_failed", "failed", "cancelled"])
    .not("brevo_list_id", "is", null)
    .is("brevo_list_deleted_at", null)
    .lt("created_at", cutoff)
    .limit(20);
  if (error) {
    console.warn("[broadcast] unable to query stale Brevo lists", { code: error.code });
    return;
  }
  for (const row of data ?? []) {
    if (typeof row.brevo_list_id === "number") await deleteBrevoBroadcastList(row.id, row.brevo_list_id);
  }
}

async function upsertBrevoBroadcastContact(recipient: BroadcastAudienceRecipient, listId: number): Promise<void> {
  const response = await brevoRequest("/contacts", {
    method: "POST",
    body: JSON.stringify({
      email: recipient.email,
      listIds: [listId],
      updateEnabled: true,
    }),
  });
  if (!response.ok) {
    const body = await brevoJson(response);
    throw new Error(body?.message ?? `brevo_contact_${response.status}`);
  }
}

async function upsertBrevoBroadcastContacts(recipients: ResolvedAudience, listId: number): Promise<void> {
  const concurrency = 5;
  for (let offset = 0; offset < recipients.length; offset += concurrency) {
    await Promise.all(recipients.slice(offset, offset + concurrency).map((recipient) => upsertBrevoBroadcastContact(recipient, listId)));
  }
}

async function createBrevoMarketingCampaign(input: {
  campaignId: string;
  listId: number;
  content: BroadcastContent;
  scheduledAt: string | null;
}): Promise<number> {
  const senderEmail = process.env.EMAIL_FROM_ADDRESS?.trim() || "notifications@tipulinks.co.il";
  const senderName = process.env.EMAIL_FROM_NAME?.trim() || "Tipulinks";
  const response = await brevoRequest("/emailCampaigns", {
    method: "POST",
    body: JSON.stringify({
      name: `Tipulinks broadcast ${input.campaignId}`,
      sender: { name: senderName, email: senderEmail },
      subject: input.content.emailSubject,
      previewText: input.content.title,
      htmlContent: renderBroadcastHtml(input.content),
      recipients: { listIds: [input.listId] },
      replyTo: senderEmail,
      tag: `tipulinks_broadcast_${input.campaignId}`,
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    }),
  });
  const body = await brevoJson(response);
  if (!response.ok || !Number.isInteger(body?.id)) throw new Error(body?.message ?? `brevo_campaign_${response.status}`);
  return body.id;
}

async function setBrevoMarketingCampaignStatus(providerCampaignId: number, status: "cancel"): Promise<void> {
  const response = await brevoRequest(`/emailCampaigns/${providerCampaignId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  if (!response.ok && response.status !== 404) {
    const body = await brevoJson(response);
    throw new Error(body?.message ?? `brevo_campaign_status_${response.status}`);
  }
}

async function deleteBrevoDraftMarketingCampaign(providerCampaignId: number): Promise<void> {
  try {
    const response = await brevoRequest(`/emailCampaigns/${providerCampaignId}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const body = await brevoJson(response);
      console.warn("[broadcast] failed to delete Brevo draft campaign", {
        providerCampaignId,
        status: response.status,
        message: body?.message,
      });
    }
  } catch (error) {
    console.warn("[broadcast] failed to delete Brevo draft campaign", {
      providerCampaignId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function markBroadcastEmailRecipients(
  campaignId: string,
  status: "submitted" | "failed",
  errorMessage: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("admin_broadcast_recipients")
    .update(
      status === "submitted"
        ? { status, submitted_at: now, error: null, updated_at: now }
        : { status, failed_at: now, error: errorMessage, updated_at: now },
    )
    .eq("campaign_id", campaignId)
    .eq("channel", "email");
  if (error) throw new Error(error.message);
}

async function sendBrevoMarketingBroadcast(
  campaignId: string,
  content: BroadcastContent,
  recipients: ResolvedAudience,
  scheduledAt: string | null,
): Promise<{ submitted: number; failed: number; error: string | null }> {
  let listId: number | null = null;
  let providerCampaignId: number | null = null;
  try {
    await cleanupOldBrevoBroadcastLists();
    listId = await createBrevoBroadcastList(campaignId);
    const listAttach = await supabaseAdmin
      .from("admin_broadcast_campaigns")
      .update({ brevo_list_id: listId, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (listAttach.error) throw new Error(listAttach.error.message);

    await upsertBrevoBroadcastContacts(recipients, listId);
    providerCampaignId = await createBrevoMarketingCampaign({ campaignId, listId, content, scheduledAt });
    const campaignAttach = await supabaseAdmin
      .from("admin_broadcast_campaigns")
      .update({ brevo_campaign_id: providerCampaignId, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (campaignAttach.error) throw new Error(campaignAttach.error.message);

    if (!scheduledAt) {
      const response = await brevoRequest(`/emailCampaigns/${providerCampaignId}/sendNow`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await brevoJson(response);
        throw new Error(body?.message ?? `brevo_send_${response.status}`);
      }
    }

    await markBroadcastEmailRecipients(campaignId, "submitted", null);
    return { submitted: recipients.length, failed: 0, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "brevo_marketing_unknown";
    await markBroadcastEmailRecipients(campaignId, "failed", message).catch(() => undefined);
    if (providerCampaignId !== null) {
      if (scheduledAt) await setBrevoMarketingCampaignStatus(providerCampaignId, "cancel").catch(() => undefined);
      else await deleteBrevoDraftMarketingCampaign(providerCampaignId);
    }
    if (listId !== null) await deleteBrevoBroadcastList(campaignId, listId);
    return { submitted: 0, failed: recipients.length, error: message };
  }
}

async function refreshCampaignCounts(campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_recipients")
    .select("channel, status")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const submitted = rows.filter((row) => ["submitted", "delivered", "opened"].includes(row.status)).length;
  const delivered = rows.filter((row) => ["delivered", "opened"].includes(row.status)).length;
  const opened = rows.filter((row) => row.status === "opened").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const { error: updateError } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .update({
      submitted_count: submitted,
      delivered_count: delivered,
      opened_count: opened,
      failed_count: failed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  if (updateError) throw new Error(updateError.message);
}

export async function createBroadcastCampaign(args: CreateBroadcastArgs, adminUserId: string) {
  const existing = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .select("id, status")
    .eq("client_request_id", args.clientRequestId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { id: existing.data.id, status: existing.data.status, duplicate: true as const };

  const now = Date.now();
  const scheduledTime = args.scheduledAt ? Date.parse(args.scheduledAt) : NaN;
  const isScheduled = Number.isFinite(scheduledTime) && scheduledTime > now + 60_000;
  const effectiveScheduledAt = isScheduled ? new Date(scheduledTime).toISOString() : null;
  if (args.channels.includes("email") && args.category === "operational" && effectiveScheduledAt && scheduledTime - now > BREVO_SCHEDULE_LIMIT_MS) {
    throw new Error("ניתן לתזמן שליחת אימייל דרך Brevo עד 72 שעות מראש.");
  }
  if (args.siteDisplayType === "banner" && !args.expiresAt) {
    throw new Error("לבאנר קבוע חובה להגדיר מועד תפוגה.");
  }
  if (args.expiresAt) {
    const expiry = Date.parse(args.expiresAt);
    const start = effectiveScheduledAt ? Date.parse(effectiveScheduledAt) : now;
    if (!Number.isFinite(expiry) || expiry <= start) throw new Error("מועד התפוגה חייב להיות מאוחר ממועד תחילת ההודעה.");
  }

  normalizedActionUrl(args.ctaUrl);
  const audience = await resolveBroadcastAudience(args.audience);
  if (audience.length === 0) throw new Error("לא נמצאו נמענים התואמים לקהל שנבחר.");
  const emailAudience = audience;
  if (args.channels.includes("email") && emailAudience.length === 0) {
    throw new Error("לא נמצאו כתובות אימייל תקינות בקהל שנבחר.");
  }

  const initialStatus = isScheduled ? "scheduled" : "sending";
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .insert({
      client_request_id: args.clientRequestId,
      created_by: adminUserId,
      category: args.category,
      title: args.title,
      email_subject: args.channels.includes("email") ? args.emailSubject : null,
      body: args.body,
      cta_label: args.ctaLabel,
      cta_url: args.ctaUrl,
      delivery_channels: args.channels,
      site_display_type: args.channels.includes("site") ? args.siteDisplayType : null,
      audience: args.audience,
      scheduled_at: effectiveScheduledAt,
      expires_at: args.expiresAt,
      status: initialStatus,
      recipient_count: audience.length,
      email_recipient_count: args.channels.includes("email") ? emailAudience.length : 0,
      site_recipient_count: args.channels.includes("site") ? audience.length : 0,
      brevo_batch_id: null,
      locked_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (campaignError) throw new Error(campaignError.message);
  const campaignId = campaign.id;
  if (args.channels.includes("email") && args.category === "operational" && effectiveScheduledAt) {
    const { error: batchIdError } = await supabaseAdmin
      .from("admin_broadcast_campaigns")
      .update({ brevo_batch_id: campaignId, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (batchIdError) throw new Error(batchIdError.message);
  }

  try {
    if (args.channels.includes("site")) {
      await insertRecipients(campaignId, "site", audience, "active");
      const { error: announcementError } = await supabaseAdmin.from("site_announcements").insert({
        campaign_id: campaignId,
        display_type: args.siteDisplayType!,
        category: args.category,
        title: args.title,
        body: args.body,
        cta_label: args.ctaLabel,
        cta_url: args.ctaUrl,
        starts_at: effectiveScheduledAt ?? new Date().toISOString(),
        expires_at: args.expiresAt,
      });
      if (announcementError) throw new Error(announcementError.message);
    }

    let emailResult = { submitted: 0, failed: 0, error: null as string | null };
    if (args.channels.includes("email")) {
      await insertRecipients(campaignId, "email", emailAudience, "pending");
      emailResult =
        args.category !== "operational"
          ? await sendBrevoMarketingBroadcast(campaignId, args, emailAudience, effectiveScheduledAt)
          : await sendBrevoCampaign(campaignId, args, emailAudience, effectiveScheduledAt);
    }

    const finalStatus =
      emailResult.failed > 0 && (emailResult.submitted > 0 || args.channels.includes("site"))
        ? "partially_failed"
        : emailResult.failed > 0
          ? "failed"
          : isScheduled
            ? "scheduled"
            : "sent";
    const { error: finishError } = await supabaseAdmin
      .from("admin_broadcast_campaigns")
      .update({ status: finalStatus, last_error: emailResult.error, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    if (finishError) throw new Error(finishError.message);
    await refreshCampaignCounts(campaignId);
    return { id: campaignId, status: finalStatus, duplicate: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await supabaseAdmin
      .from("admin_broadcast_campaigns")
      .update({ status: "failed", last_error: message, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    throw error;
  }
}

export async function sendBroadcastTest(content: BroadcastContent, adminUserId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(adminUserId);
  if (error) throw new Error(error.message);
  const email = data.user?.email;
  if (!email) throw new Error("לא נמצאה כתובת אימייל לחשבון האדמין.");
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY אינו מוגדר.");
  normalizedActionUrl(content.ctaUrl);
  // The real marketing send goes through Marketing Campaigns, where Brevo
  // resolves {{ unsubscribe }}. The private admin test uses transactional mail
  // only as a preview, so omit that provider placeholder from the test copy.
  const testContent: BroadcastContent = content.category !== "operational" ? { ...content, category: "operational" } : content;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: {
        name: process.env.EMAIL_FROM_NAME || "Tipulinks",
        email: process.env.EMAIL_FROM_ADDRESS || "notifications@tipulinks.co.il",
      },
      to: [{ email }],
      subject: `[בדיקה] ${content.emailSubject || content.title}`,
      htmlContent: renderBroadcastHtml(testContent),
      textContent: renderBroadcastText(testContent),
      tags: ["tipulinks_broadcast_test"],
    }),
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) throw new Error(payload?.message ?? `brevo_${response.status}`);
  return email;
}

export async function listBroadcastCampaigns(): Promise<AdminBroadcastCampaignRow[]> {
  await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .select(
      "id, category, title, email_subject, body, cta_label, cta_url, audience, delivery_channels, site_display_type, status, scheduled_at, expires_at, recipient_count, email_recipient_count, site_recipient_count, submitted_count, delivered_count, opened_count, failed_count, created_at, cancelled_at, last_error",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category as AdminBroadcastCampaignRow["category"],
    title: row.title,
    emailSubject: row.email_subject,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    audience: row.audience as unknown as AdminBroadcastCampaignRow["audience"],
    channels: row.delivery_channels as AdminBroadcastCampaignRow["channels"],
    siteDisplayType: row.site_display_type as AdminBroadcastCampaignRow["siteDisplayType"],
    status: row.status as AdminBroadcastCampaignRow["status"],
    scheduledAt: row.scheduled_at,
    expiresAt: row.expires_at,
    recipientCount: row.recipient_count,
    emailRecipientCount: row.email_recipient_count,
    siteRecipientCount: row.site_recipient_count,
    submittedCount: row.submitted_count,
    deliveredCount: row.delivered_count,
    openedCount: row.opened_count,
    failedCount: row.failed_count,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    lastError: row.last_error,
  }));
}

export async function cancelBroadcastCampaign(campaignId: string): Promise<void> {
  const { data: campaign, error } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .select("id, status, delivery_channels, brevo_batch_id, brevo_campaign_id, brevo_list_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) throw new Error("ההודעה לא נמצאה.");
  if (campaign.status !== "scheduled") throw new Error("ניתן לבטל רק הודעה שעדיין מתוזמנת.");

  if (campaign.delivery_channels.includes("email") && campaign.brevo_campaign_id) {
    await setBrevoMarketingCampaignStatus(campaign.brevo_campaign_id, "cancel");
  } else if (campaign.delivery_channels.includes("email") && campaign.brevo_batch_id) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("BREVO_API_KEY אינו מוגדר ולכן לא ניתן לבטל את השליחה המתוזמנת.");
    const response = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(campaign.brevo_batch_id)}`, {
      method: "DELETE",
      headers: { accept: "application/json", "api-key": apiKey },
    });
    if (!response.ok && response.status !== 404) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? `brevo_${response.status}`);
    }
  }

  const now = new Date().toISOString();
  const { error: announcementError } = await supabaseAdmin
    .from("site_announcements")
    .update({ cancelled_at: now })
    .eq("campaign_id", campaignId);
  if (announcementError) throw new Error(announcementError.message);
  const { error: recipientsError } = await supabaseAdmin
    .from("admin_broadcast_recipients")
    .update({ status: "cancelled", updated_at: now })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "active", "submitted"]);
  if (recipientsError) throw new Error(recipientsError.message);
  const { error: campaignError } = await supabaseAdmin
    .from("admin_broadcast_campaigns")
    .update({ status: "cancelled", cancelled_at: now, updated_at: now })
    .eq("id", campaignId);
  if (campaignError) throw new Error(campaignError.message);
  if (typeof campaign.brevo_list_id === "number") await deleteBrevoBroadcastList(campaignId, campaign.brevo_list_id);
}

export async function listActiveSiteAnnouncements(authUserId: string): Promise<ActiveSiteAnnouncement[]> {
  const now = new Date().toISOString();
  const { data: recipientRows, error: recipientError } = await supabaseAdmin
    .from("admin_broadcast_recipients")
    .select("campaign_id")
    .eq("auth_user_id", authUserId)
    .eq("channel", "site")
    .eq("status", "active");
  if (recipientError) throw new Error(recipientError.message);
  const campaignIds = [...new Set((recipientRows ?? []).map((row) => row.campaign_id))];
  if (campaignIds.length === 0) return [];

  const [{ data: announcements, error: announcementsError }, { data: dismissals, error: dismissalsError }] = await Promise.all([
    supabaseAdmin
      .from("site_announcements")
      .select("id, campaign_id, display_type, category, title, body, cta_label, cta_url, starts_at, expires_at")
      .in("campaign_id", campaignIds)
      .is("cancelled_at", null)
      .lte("starts_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("starts_at", { ascending: false }),
    supabaseAdmin.from("user_announcement_dismissals").select("announcement_id").eq("auth_user_id", authUserId),
  ]);
  if (announcementsError) throw new Error(announcementsError.message);
  if (dismissalsError) throw new Error(dismissalsError.message);
  const dismissed = new Set((dismissals ?? []).map((row) => row.announcement_id));
  return (announcements ?? [])
    .filter((row) => row.display_type === "banner" || !dismissed.has(row.id))
    .map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      displayType: row.display_type as SiteAnnouncementDisplayType,
      category: row.category as BroadcastCategory,
      title: row.title,
      body: row.body,
      ctaLabel: row.cta_label,
      ctaUrl: row.cta_url,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
    }));
}

export async function dismissSiteAnnouncement(announcementId: string, authUserId: string): Promise<void> {
  const { data: announcement, error } = await supabaseAdmin
    .from("site_announcements")
    .select("id, campaign_id, display_type")
    .eq("id", announcementId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!announcement || announcement.display_type !== "modal") throw new Error("החלונית אינה זמינה לסגירה.");
  const { data: recipient, error: recipientError } = await supabaseAdmin
    .from("admin_broadcast_recipients")
    .select("id")
    .eq("campaign_id", announcement.campaign_id)
    .eq("auth_user_id", authUserId)
    .eq("channel", "site")
    .maybeSingle();
  if (recipientError) throw new Error(recipientError.message);
  if (!recipient) throw new Error("אין הרשאה לסגור הודעה זו.");
  const { error: dismissalError } = await supabaseAdmin.from("user_announcement_dismissals").upsert({
    announcement_id: announcementId,
    auth_user_id: authUserId,
    dismissed_at: new Date().toISOString(),
  });
  if (dismissalError) throw new Error(dismissalError.message);
}

function broadcastCampaignIdFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    if (typeof tag !== "string" || !tag.startsWith(BROADCAST_TAG_PREFIX)) continue;
    const id = tag.slice(BROADCAST_TAG_PREFIX.length);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return id;
  }
  return null;
}

export async function applyBroadcastBrevoWebhook(payload: unknown): Promise<boolean> {
  if (!payload || typeof payload !== "object") return false;
  const event = payload as Record<string, unknown>;
  const rawTag = typeof event.tag === "string" ? event.tag : null;
  const rawTags = Array.isArray(event.tags)
    ? event.tags
    : rawTag
      ? (() => {
          if (rawTag.startsWith(BROADCAST_TAG_PREFIX)) return [rawTag];
          try {
            const parsed = JSON.parse(rawTag) as unknown;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  let campaignId: string | null = null;
  const providerCampaignId = Number(event.camp_id);
  if (Number.isInteger(providerCampaignId) && providerCampaignId > 0) {
    const byProviderCampaign = await supabaseAdmin
      .from("admin_broadcast_campaigns")
      .select("id")
      .eq("brevo_campaign_id", providerCampaignId)
      .maybeSingle();
    if (byProviderCampaign.error) throw new Error(byProviderCampaign.error.message);
    campaignId = byProviderCampaign.data?.id ?? null;
  }
  campaignId ??= broadcastCampaignIdFromTags(rawTags);
  if (!campaignId) return false;
  const status = normalizeBrevoEmailEvent(event.event);
  if (!status) return true;
  const messageId =
    typeof event["message-id"] === "string"
      ? event["message-id"]
      : typeof event.messageId === "string"
        ? event.messageId
        : null;
  const email = typeof event.email === "string" ? event.email.trim().toLowerCase() : null;

  let recipient: { id: string; status: string } | null = null;
  if (messageId) {
    const byMessage = await supabaseAdmin
      .from("admin_broadcast_recipients")
      .select("id, status")
      .eq("campaign_id", campaignId)
      .eq("channel", "email")
      .eq("provider_message_id", messageId)
      .maybeSingle();
    if (byMessage.error) throw new Error(byMessage.error.message);
    recipient = byMessage.data;
  }
  if (!recipient && email) {
    const byEmail = await supabaseAdmin
      .from("admin_broadcast_recipients")
      .select("id, status")
      .eq("campaign_id", campaignId)
      .eq("channel", "email")
      .eq("email", email)
      .maybeSingle();
    if (byEmail.error) throw new Error(byEmail.error.message);
    recipient = byEmail.data;
  }
  if (!recipient) return true;

  const now = new Date().toISOString();
  const update: Record<string, string | null> = { updated_at: now };
  if (["opened", "unique_opened", "proxy_open", "unique_proxy_open", "click", "clicked"].includes(status)) {
    update.status = "opened";
    update.opened_at = now;
    update.delivered_at = now;
  } else if (status === "delivered") {
    if (recipient.status !== "opened") update.status = "delivered";
    update.delivered_at = now;
  } else if (["hard_bounce", "soft_bounce", "blocked", "invalid_email", "error", "spam", "unsubscribe", "unsubscribed"].includes(status)) {
    update.status = "failed";
    update.failed_at = now;
    update.error = typeof event.reason === "string" ? event.reason : status;
  } else if (["sent", "request", "deferred"].includes(status)) {
    if (!["delivered", "opened"].includes(recipient.status)) update.status = "submitted";
  }
  const { error: updateError } = await supabaseAdmin.from("admin_broadcast_recipients").update(update).eq("id", recipient.id);
  if (updateError) throw new Error(updateError.message);
  await refreshCampaignCounts(campaignId);
  return true;
}
