import { randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recruitmentTokenHash } from "./recruitment-token";

export { recruitmentTokenHash } from "./recruitment-token";

const BREVO_BASE_URL = "https://api.brevo.com/v3";
export const RECRUITMENT_INVITE_ATTRIBUTE = "TIPULINKS_INVITE_URL";
export const RECRUITMENT_EMAIL_DAILY_LIMIT = 100;
export const RECRUITMENT_EMAIL_SUBJECT = "הכירו את טיפולינקס – דרך חדשה להגיע למטופלים";
export const RECRUITMENT_EMAIL_PREVIEW = "פרופיל מקצועי בחינם ותשלום רק עבור פניות ממטופלים שבחרו ליצור איתכם קשר.";

export type ReservedRecruitmentInvitation = {
  sendBatchId: string;
  invitationId: string;
  destination: string;
  firstName: string | null;
  lastName: string | null;
  remainingAfterReservation: number;
  rawToken: string;
};

function requirePositiveIntegerEnv(name: string): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name}_not_configured`);
  return value;
}

function recruitmentOrigin(): string {
  const configured = process.env.TIPULINKS_PUBLIC_ORIGIN?.trim();
  if (!configured) throw new Error("TIPULINKS_PUBLIC_ORIGIN_not_configured");
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:") throw new Error("TIPULINKS_PUBLIC_ORIGIN_must_use_https");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("TIPULINKS_PUBLIC_ORIGIN_invalid");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") throw new Error("TIPULINKS_PUBLIC_ORIGIN_invalid");
  return parsed.origin;
}

export function recruitmentInviteUrl(token: string): string {
  const url = new URL("/auth", recruitmentOrigin());
  url.searchParams.set("mode", "signup");
  url.searchParams.set("invite", token);
  url.searchParams.set("next", "/new-profile");
  return url.toString();
}

function newRecruitmentToken(): string {
  return randomBytes(32).toString("base64url");
}

async function brevoRequest(path: string, init: RequestInit): Promise<Response> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error("brevo_not_configured");
  return fetch(`${BREVO_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function brevoJson(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

async function ensureRecruitmentInviteAttribute(): Promise<void> {
  const listResponse = await brevoRequest("/contacts/attributes", { method: "GET" });
  const listBody = await brevoJson(listResponse);
  if (!listResponse.ok) throw new Error(listBody?.message ?? `brevo_attributes_${listResponse.status}`);
  const attributes = Array.isArray(listBody?.attributes) ? listBody.attributes : [];
  if (attributes.some((row: any) => row?.name === RECRUITMENT_INVITE_ATTRIBUTE)) return;

  const createResponse = await brevoRequest(
    `/contacts/attributes/normal/${encodeURIComponent(RECRUITMENT_INVITE_ATTRIBUTE)}`,
    { method: "POST", body: JSON.stringify({ type: "text" }) },
  );
  if (!createResponse.ok) {
    const body = await brevoJson(createResponse);
    // A concurrent first send may have created it between GET and POST.
    if (createResponse.status !== 400) throw new Error(body?.message ?? `brevo_attribute_${createResponse.status}`);
    const retry = await brevoRequest("/contacts/attributes", { method: "GET" });
    const retryBody = await brevoJson(retry);
    if (
      !retry.ok ||
      !Array.isArray(retryBody?.attributes) ||
      !retryBody.attributes.some((row: any) => row?.name === RECRUITMENT_INVITE_ATTRIBUTE)
    ) {
      throw new Error(body?.message ?? "brevo_recruitment_attribute_missing");
    }
  }
}

async function createBrevoList(name: string): Promise<number> {
  const folderId = requirePositiveIntegerEnv("BREVO_RECRUITMENT_FOLDER_ID");
  const response = await brevoRequest("/contacts/lists", {
    method: "POST",
    body: JSON.stringify({ folderId, name }),
  });
  const body = await brevoJson(response);
  if (!response.ok || !Number.isInteger(body?.id)) throw new Error(body?.message ?? `brevo_list_${response.status}`);
  return body.id;
}

async function markBrevoListDeleted(sendBatchId: string, listId: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("mark_recruitment_provider_list_deleted", {
    _send_batch_id: sendBatchId,
    _provider_list_id: listId,
  });
  if (error) {
    console.error("[recruitment] failed to persist Brevo list cleanup", { sendBatchId, listId, code: error.code });
  }
}

async function deleteBrevoRecruitmentList(sendBatchId: string, listId: number): Promise<boolean> {
  try {
    const response = await brevoRequest(`/contacts/lists/${listId}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const body = await brevoJson(response);
      console.warn("[recruitment] Brevo list cleanup failed", {
        sendBatchId,
        listId,
        status: response.status,
        message: body?.message,
      });
      return false;
    }
    await markBrevoListDeleted(sendBatchId, listId);
    return true;
  } catch (error) {
    console.warn("[recruitment] Brevo list cleanup failed", {
      sendBatchId,
      listId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

async function cleanupOldBrevoRecruitmentLists(): Promise<void> {
  // Recruitment campaigns use short-lived recipient lists. Once a campaign is
  // at least seven days old, webhook correlation relies on campaign id + email
  // stored in Tipulinks and no longer needs the Brevo list itself.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("therapist_recruitment_send_batches")
    .select("id,provider_list_id")
    .eq("provider", "brevo")
    .in("status", ["submitted", "submission_failed", "submission_unknown"])
    .not("provider_list_id", "is", null)
    .is("provider_list_deleted_at", null)
    .lt("created_at", cutoff)
    .limit(20);
  if (error) {
    console.warn("[recruitment] unable to query stale Brevo lists", { code: error.code });
    return;
  }
  for (const row of data ?? []) {
    if (typeof row.provider_list_id === "number") {
      await deleteBrevoRecruitmentList(row.id, row.provider_list_id);
    }
  }
}

async function upsertBrevoContact(input: { email: string; listId: number; inviteUrl: string }): Promise<void> {
  const response = await brevoRequest("/contacts", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      attributes: { [RECRUITMENT_INVITE_ATTRIBUTE]: input.inviteUrl },
      listIds: [input.listId],
      updateEnabled: true,
    }),
  });
  if (!response.ok) {
    const body = await brevoJson(response);
    throw new Error(body?.message ?? `brevo_contact_${response.status}`);
  }
}

async function upsertBrevoContactsForBatch(rows: ReservedRecruitmentInvitation[], listId: number): Promise<void> {
  // Keep provider pressure bounded while avoiding 100 sequential HTTP calls on
  // the admin request. Any failure here occurs before sendNow, so the batch is
  // safely retryable on the same invitation rows.
  const concurrency = 5;
  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const chunk = rows.slice(offset, offset + concurrency);
    await Promise.all(
      chunk.map((row) =>
        upsertBrevoContact({
          email: row.destination,
          listId,
          inviteUrl: recruitmentInviteUrl(row.rawToken),
        }),
      ),
    );
  }
}

async function createBrevoCampaign(input: { listId: number; sendBatchId: string }): Promise<number> {
  const templateId = requirePositiveIntegerEnv("BREVO_RECRUITMENT_TEMPLATE_ID");
  const senderEmail = process.env.BREVO_RECRUITMENT_FROM_ADDRESS?.trim();
  if (!senderEmail) throw new Error("BREVO_RECRUITMENT_FROM_ADDRESS_not_configured");
  const senderName = process.env.EMAIL_FROM_NAME?.trim() || "Tipulinks";
  const response = await brevoRequest("/emailCampaigns", {
    method: "POST",
    body: JSON.stringify({
      name: `Tipulinks therapist recruitment ${input.sendBatchId}`,
      sender: { name: senderName, email: senderEmail },
      subject: RECRUITMENT_EMAIL_SUBJECT,
      previewText: RECRUITMENT_EMAIL_PREVIEW,
      templateId,
      recipients: { listIds: [input.listId] },
      replyTo: senderEmail,
    }),
  });
  const body = await brevoJson(response);
  if (!response.ok || !Number.isInteger(body?.id))
    throw new Error(body?.message ?? `brevo_campaign_${response.status}`);
  return body.id;
}

async function deleteBrevoDraftCampaign(campaignId: number): Promise<void> {
  try {
    const response = await brevoRequest(`/emailCampaigns/${campaignId}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const body = await brevoJson(response);
      console.warn("[recruitment] failed to delete unused Brevo draft campaign", {
        campaignId,
        status: response.status,
        message: body?.message,
      });
    }
  } catch (error) {
    console.warn("[recruitment] failed to delete unused Brevo draft campaign", {
      campaignId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function sendBrevoCampaignNow(
  campaignId: number,
): Promise<{ ok: boolean; definiteFailure: boolean; error?: string }> {
  try {
    const response = await brevoRequest(`/emailCampaigns/${campaignId}/sendNow`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (response.ok) return { ok: true, definiteFailure: false };
    const body = await brevoJson(response);
    return {
      ok: false,
      definiteFailure: response.status >= 400 && response.status < 500,
      error: body?.message ?? `brevo_send_${response.status}`,
    };
  } catch (error) {
    return { ok: false, definiteFailure: false, error: error instanceof Error ? error.message : "brevo_send_unknown" };
  }
}

export async function reserveRecruitmentEmailInvitations(
  invitationIds: string[],
  adminUserId: string,
): Promise<ReservedRecruitmentInvitation[]> {
  const tokenRows = await Promise.all(
    invitationIds.map(async (id) => {
      const rawToken = newRecruitmentToken();
      return { id, rawToken, tokenHash: await recruitmentTokenHash(rawToken) };
    }),
  );
  const { data, error } = await supabaseAdmin.rpc("reserve_recruitment_email_invitations", {
    _reservations: tokenRows.map((row) => ({ id: row.id, token_hash: row.tokenHash })),
    _created_by: adminUserId,
  });
  if (error) throw new Error(error.message);
  const rawById = new Map(tokenRows.map((row) => [row.id, row.rawToken]));
  return ((data ?? []) as any[]).map((row) => ({
    sendBatchId: row.send_batch_id,
    invitationId: row.invitation_id,
    destination: row.destination_normalized,
    firstName: row.first_name,
    lastName: row.last_name,
    remainingAfterReservation: row.remaining_after_reservation,
    rawToken: rawById.get(row.invitation_id)!,
  }));
}

export async function deliverRecruitmentEmailBatch(rows: ReservedRecruitmentInvitation[]): Promise<{
  sendBatchId: string;
  submittedCount: number;
  remainingToday: number;
  outcome: "submitted" | "submission_failed" | "submission_unknown";
  error?: string;
}> {
  if (rows.length === 0) throw new Error("empty_recruitment_send_batch");
  const sendBatchId = rows[0]!.sendBatchId;
  const remainingToday = rows[0]!.remainingAfterReservation;
  let listId: number | null = null;
  let campaignId: number | null = null;

  try {
    await ensureRecruitmentInviteAttribute();
    await cleanupOldBrevoRecruitmentLists();
    listId = await createBrevoList(`Tipulinks recruitment ${sendBatchId}`);
    const listAttach = await supabaseAdmin.rpc("attach_recruitment_email_provider_list", {
      _send_batch_id: sendBatchId,
      _provider_list_id: listId,
    });
    if (listAttach.error) throw new Error(listAttach.error.message);
    await upsertBrevoContactsForBatch(rows, listId);
    campaignId = await createBrevoCampaign({ listId, sendBatchId });
    const attach = await supabaseAdmin.rpc("attach_recruitment_email_provider_batch", {
      _send_batch_id: sendBatchId,
      _provider_list_id: listId,
      _provider_campaign_id: campaignId,
    });
    if (attach.error) throw new Error(attach.error.message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "brevo_prepare_failed";
    if (campaignId !== null) await deleteBrevoDraftCampaign(campaignId);
    if (listId !== null) await deleteBrevoRecruitmentList(sendBatchId, listId);
    await supabaseAdmin.rpc("finish_recruitment_email_send_batch", {
      _send_batch_id: sendBatchId,
      _outcome: "submission_failed",
      _failure_code: "provider_prepare_failed",
      _failure_reason: reason,
    });
    return { sendBatchId, submittedCount: 0, remainingToday, outcome: "submission_failed", error: reason };
  }

  const result = await sendBrevoCampaignNow(campaignId!);
  if (result.ok) {
    const finish = await supabaseAdmin.rpc("finish_recruitment_email_send_batch", {
      _send_batch_id: sendBatchId,
      _outcome: "submitted",
      _failure_code: null as any,
      _failure_reason: null as any,
    });
    if (finish.error) {
      console.error("[recruitment] Brevo accepted campaign but submitted state was not persisted", {
        sendBatchId,
        campaignId,
        code: finish.error.code,
      });
      return {
        sendBatchId,
        submittedCount: rows.length,
        remainingToday,
        outcome: "submission_unknown",
        error: "provider_accepted_state_persist_failed",
      };
    }
    return { sendBatchId, submittedCount: rows.length, remainingToday, outcome: "submitted" };
  }

  const outcome = result.definiteFailure ? "submission_failed" : "submission_unknown";
  const finish = await supabaseAdmin.rpc("finish_recruitment_email_send_batch", {
    _send_batch_id: sendBatchId,
    _outcome: outcome,
    _failure_code: result.definiteFailure ? "provider_rejected" : "provider_result_unknown",
    _failure_reason: result.error ?? undefined,
  });
  if (finish.error)
    console.error("[recruitment] failed to persist provider outcome", { sendBatchId, code: finish.error.code });
  return { sendBatchId, submittedCount: 0, remainingToday, outcome, error: result.error };
}

export function normalizeRecruitmentBrevoEvent(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "hardbounce" || raw === "hard_bounce" || raw === "hard_bounced") return "hard_bounce";
  if (raw === "softbounce" || raw === "soft_bounce" || raw === "soft_bounced") return "soft_bounce";
  if (raw === "unsubscribed" || raw === "unsubscribe") return "unsubscribed";
  if (raw === "invalid") return "invalid_email";
  return raw;
}

function eventTimestamp(payload: any): string | null {
  const seconds = Number(payload?.ts_event ?? payload?.ts);
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  return null;
}

export async function applyRecruitmentBrevoWebhook(payload: any): Promise<void> {
  const campaignId = Number(payload?.camp_id);
  const email = typeof payload?.email === "string" ? payload.email : "";
  const event = normalizeRecruitmentBrevoEvent(payload?.event);
  if (!Number.isInteger(campaignId) || campaignId <= 0 || !email) return;
  const relevant = new Set([
    "delivered",
    "hard_bounce",
    "soft_bounce",
    "bounce",
    "invalid_email",
    "blocked",
    "unsubscribed",
    "spam",
  ]);
  if (!relevant.has(event)) return;
  const { error } = await supabaseAdmin.rpc("apply_recruitment_email_event", {
    _provider_campaign_id: campaignId,
    _email: email,
    _event: event,
    _event_at: eventTimestamp(payload) as any,
  });
  if (error) throw new Error(error.message);
}
