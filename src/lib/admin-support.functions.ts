import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";

export const SUPPORT_STATUSES = ["new", "in_review", "resolved", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportSource = "site" | "email";

export type AdminSupportRequest = {
  id: string;
  accountId: string | null;
  accountEmail: string | null;
  therapistName: string | null;
  requesterEmail: string | null;
  requesterName: string | null;
  category: "bug" | "complaint" | "suggestion" | "other";
  subject: string;
  message: string;
  status: SupportStatus;
  source: SupportSource;
  ticketCode: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  reviewedAt: string | null;
};

export type AdminSupportMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  channel: "site" | "email";
  senderEmail: string | null;
  senderName: string | null;
  recipientEmail: string | null;
  body: string;
  hasAttachment: boolean;
  occurredAt: string;
};

export type AdminSupportConversation = {
  request: AdminSupportRequest;
  messages: AdminSupportMessage[];
};

type SupportRequestRow = {
  id: string;
  account_id: string | null;
  category: string;
  subject: string;
  message: string;
  status: string;
  source: string;
  requester_email: string | null;
  requester_name: string | null;
  ticket_code: string;
  zoho_thread_id: string | null;
  last_zoho_message_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  reviewed_at: string | null;
};

function normalizeCategory(value: string): AdminSupportRequest["category"] {
  return value === "bug" || value === "complaint" || value === "suggestion" ? value : "other";
}

function normalizeStatus(value: string): SupportStatus {
  return value === "in_review" || value === "resolved" || value === "closed" ? value : "new";
}

function normalizeSource(value: string): SupportSource {
  return value === "email" ? "email" : "site";
}

async function loadAccountIdentityMaps(accountIds: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!accountIds.length) {
    return {
      emailMap: new Map<string, string | null>(),
      therapistMap: new Map<string, string | null>(),
    };
  }

  const [{ data: accounts, error: accountsError }, { data: therapists, error: therapistsError }] = await Promise.all([
    supabaseAdmin.from("therapist_accounts").select("id, auth_user_id").in("id", accountIds),
    supabaseAdmin.from("therapists").select("owner_account_id, full_name").in("owner_account_id", accountIds),
  ]);
  if (accountsError) throw new Error(accountsError.message);
  if (therapistsError) throw new Error(therapistsError.message);

  const therapistMap = new Map<string, string | null>(
    (therapists ?? []).map((therapist) => [therapist.owner_account_id!, therapist.full_name]),
  );
  const emailEntries = await Promise.all(
    (accounts ?? []).map(async (account) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(account.auth_user_id);
      return [account.id, data.user?.email ?? null] as const;
    }),
  );
  return { emailMap: new Map(emailEntries), therapistMap };
}

async function rowsToAdminRequests(rows: SupportRequestRow[]): Promise<AdminSupportRequest[]> {
  const accountIds = [...new Set(rows.map((row) => row.account_id).filter((value): value is string => Boolean(value)))];
  const { emailMap, therapistMap } = await loadAccountIdentityMaps(accountIds);
  return rows.map((request) => ({
    id: request.id,
    accountId: request.account_id,
    accountEmail: request.account_id ? (emailMap.get(request.account_id) ?? null) : null,
    therapistName: request.account_id ? (therapistMap.get(request.account_id) ?? null) : null,
    requesterEmail: request.requester_email ?? (request.account_id ? (emailMap.get(request.account_id) ?? null) : null),
    requesterName:
      request.requester_name ?? (request.account_id ? (therapistMap.get(request.account_id) ?? null) : null),
    category: normalizeCategory(request.category),
    subject: request.subject,
    message: request.message,
    status: normalizeStatus(request.status),
    source: normalizeSource(request.source),
    ticketCode: request.ticket_code,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    lastMessageAt: request.last_message_at,
    reviewedAt: request.reviewed_at,
  }));
}

const REQUEST_SELECT =
  "id, account_id, category, subject, message, status, source, requester_email, requester_name, ticket_code, zoho_thread_id, last_zoho_message_id, created_at, updated_at, last_message_at, reviewed_at";

export const listAdminSupportRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSupportRequest[]> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בפניות לצוות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("account_support_requests")
      .select(REQUEST_SELECT)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rowsToAdminRequests((data ?? []) as SupportRequestRow[]);
  });

const ConversationSchema = z.object({ requestId: z.string().uuid() });

export const getAdminSupportConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConversationSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminSupportConversation> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בפניות לצוות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: request, error: requestError }, { data: messages, error: messagesError }] = await Promise.all([
      supabaseAdmin.from("account_support_requests").select(REQUEST_SELECT).eq("id", data.requestId).maybeSingle(),
      supabaseAdmin
        .from("account_support_messages")
        .select("id, direction, channel, sender_email, sender_name, recipient_email, body, has_attachment, occurred_at")
        .eq("request_id", data.requestId)
        .order("occurred_at", { ascending: true }),
    ]);
    if (requestError) throw new Error(requestError.message);
    if (messagesError) throw new Error(messagesError.message);
    if (!request) throw new Error("הפנייה אינה קיימת.");

    const [normalizedRequest] = await rowsToAdminRequests([request as SupportRequestRow]);
    return {
      request: normalizedRequest,
      messages: (messages ?? []).map((message) => ({
        id: message.id,
        direction: message.direction === "outgoing" ? "outgoing" : "incoming",
        channel: message.channel === "email" ? "email" : "site",
        senderEmail: message.sender_email,
        senderName: message.sender_name,
        recipientEmail: message.recipient_email,
        body: message.body,
        hasAttachment: message.has_attachment,
        occurredAt: message.occurred_at,
      })),
    };
  });

const StatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(SUPPORT_STATUSES),
});

export const updateAdminSupportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לטיפול בפניות לצוות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("account_support_requests")
      .update({
        status: data.status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("הפנייה אינה זמינה לטיפול.");
    return { ok: true as const };
  });

const ReplySchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().trim().min(1, "נא להזין תשובה.").max(5000, "התשובה ארוכה מדי."),
});

async function resolveRequestRecipient(request: SupportRequestRow): Promise<string | null> {
  if (request.requester_email) return request.requester_email.trim().toLowerCase();
  if (!request.account_id) return null;
  const { emailMap } = await loadAccountIdentityMaps([request.account_id]);
  return emailMap.get(request.account_id)?.trim().toLowerCase() ?? null;
}

export const replyAdminSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReplySchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשליחת תשובה לפנייה.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: request, error: requestError } = await supabaseAdmin
      .from("account_support_requests")
      .select(REQUEST_SELECT)
      .eq("id", data.requestId)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("הפנייה אינה קיימת.");

    const typedRequest = request as SupportRequestRow;
    const recipient = await resolveRequestRecipient(typedRequest);
    if (!recipient) throw new Error("לא נמצאה כתובת אימייל שאליה ניתן להשיב.");

    const { data: latestIncoming, error: incomingError } = await supabaseAdmin
      .from("account_support_messages")
      .select("zoho_message_id")
      .eq("request_id", data.requestId)
      .eq("direction", "incoming")
      .eq("channel", "email")
      .not("zoho_message_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (incomingError) throw new Error(incomingError.message);

    const { getZohoMailboxAddress, replyViaZoho, sendZohoSupportEmail, supportTicketSubject } =
      await import("./zoho-mail.server");
    const subject = supportTicketSubject(typedRequest.subject, typedRequest.ticket_code);
    const sent = latestIncoming?.zoho_message_id
      ? await replyViaZoho({
          messageId: latestIncoming.zoho_message_id,
          toAddress: recipient,
          subject,
          content: data.message,
        })
      : await sendZohoSupportEmail({
          toAddress: recipient,
          subject,
          content: data.message,
        });

    const now = new Date().toISOString();
    const { error: messageError } = await supabaseAdmin.from("account_support_messages").insert({
      request_id: data.requestId,
      direction: "outgoing",
      channel: "email",
      sender_email: getZohoMailboxAddress(),
      recipient_email: recipient,
      body: data.message,
      zoho_message_id: sent.messageId,
      zoho_thread_id: sent.threadId ?? typedRequest.zoho_thread_id,
      occurred_at: now,
    });
    if (messageError) throw new Error(messageError.message);

    const { error: updateError } = await supabaseAdmin
      .from("account_support_requests")
      .update({
        status: typedRequest.status === "new" ? "in_review" : typedRequest.status,
        requester_email: typedRequest.requester_email ?? recipient,
        zoho_thread_id: typedRequest.zoho_thread_id ?? sent.threadId,
        last_zoho_message_id: sent.messageId ?? typedRequest.last_zoho_message_id,
        last_message_at: now,
        reviewed_by: context.userId,
        reviewed_at: now,
      })
      .eq("id", data.requestId);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const };
  });

const DeleteSupportSchema = z.object({ requestId: z.string().uuid() });

export const deleteAdminSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSupportSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל למחיקת פניות לצוות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: request, error: requestError }, { data: messages, error: messagesError }] = await Promise.all([
      supabaseAdmin
        .from("account_support_requests")
        .select("id, zoho_thread_id")
        .eq("id", data.requestId)
        .maybeSingle(),
      supabaseAdmin
        .from("account_support_messages")
        .select("zoho_message_id")
        .eq("request_id", data.requestId)
        .not("zoho_message_id", "is", null),
    ]);
    if (requestError) throw new Error(requestError.message);
    if (messagesError) throw new Error(messagesError.message);
    if (!request) throw new Error("הפנייה אינה קיימת.");

    const zohoMessageIds = [
      ...new Set((messages ?? []).map((message) => message.zoho_message_id).filter(Boolean)),
    ] as string[];
    const { moveZohoSupportConversationToTrash } = await import("./zoho-mail.server");

    // Zoho is handled first. If it fails (including a missing DELETE OAuth scope),
    // the local request is deliberately left untouched.
    const zohoDeleted = await moveZohoSupportConversationToTrash({
      threadId: request.zoho_thread_id,
      messageIds: zohoMessageIds,
    });

    const { data: deleted, error: deleteError } = await supabaseAdmin
      .from("account_support_requests")
      .delete()
      .eq("id", data.requestId)
      .select("id")
      .maybeSingle();
    if (deleteError) throw new Error(deleteError.message);
    if (!deleted) throw new Error("הפנייה אינה זמינה למחיקה.");

    return { ok: true as const, zohoDeleted };
  });

export const syncAdminSupportMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לסנכרון תיבת התמיכה.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractSupportTicketCode, getZohoMessageText, listRecentZohoIncomingMessages } =
      await import("./zoho-mail.server");

    const incoming = await listRecentZohoIncomingMessages();
    if (!incoming.length) return { imported: 0, checked: 0 };

    const messageIds = incoming.map((message) => message.messageId);
    const [{ data: existingMessages, error: existingError }, { data: requests, error: requestsError }] =
      await Promise.all([
        supabaseAdmin.from("account_support_messages").select("zoho_message_id").in("zoho_message_id", messageIds),
        supabaseAdmin
          .from("account_support_requests")
          .select("id, ticket_code, zoho_thread_id, status, subject, requester_email, requester_name, account_id"),
      ]);
    if (existingError) throw new Error(existingError.message);
    if (requestsError) throw new Error(requestsError.message);

    const knownMessageIds = new Set((existingMessages ?? []).map((row) => row.zoho_message_id).filter(Boolean));
    const byTicket = new Map((requests ?? []).map((row) => [row.ticket_code, row]));
    const byThread = new Map(
      (requests ?? []).filter((row) => row.zoho_thread_id).map((row) => [String(row.zoho_thread_id), row]),
    );

    let imported = 0;
    const ordered = [...incoming].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    for (const message of ordered) {
      if (knownMessageIds.has(message.messageId)) continue;

      const ticketCode = extractSupportTicketCode(message.subject);
      let request = ticketCode ? byTicket.get(ticketCode) : undefined;
      if (!request && message.threadId) request = byThread.get(message.threadId);
      if (request?.requester_email && request.requester_email.trim().toLowerCase() !== message.fromAddress) {
        request = undefined;
      }
      const body = await getZohoMessageText(message);

      if (!request) {
        const externalSubject = message.subject.trim().length >= 3 ? message.subject.trim().slice(0, 120) : "ללא נושא";
        const externalSummary =
          body.trim().length >= 10 ? body.trim().slice(0, 4000) : `תוכן האימייל: ${body.trim() || "ללא תוכן"}`;
        const { data: created, error: createError } = await supabaseAdmin
          .from("account_support_requests")
          .insert({
            account_id: null,
            category: "other",
            subject: externalSubject,
            message: externalSummary.slice(0, 4000),
            status: "new",
            source: "email",
            requester_email: message.fromAddress,
            requester_name: message.senderName,
            zoho_thread_id: message.threadId,
            last_zoho_message_id: message.messageId,
            last_message_at: message.receivedAt,
          })
          .select("id, ticket_code, zoho_thread_id, status, subject, requester_email, requester_name, account_id")
          .single();
        if (createError) throw new Error(createError.message);
        request = created;
        byTicket.set(created.ticket_code, created);
        if (created.zoho_thread_id) byThread.set(String(created.zoho_thread_id), created);
      } else {
        const nextStatus = request.status === "closed" || request.status === "resolved" ? "new" : request.status;
        const { error: updateError } = await supabaseAdmin
          .from("account_support_requests")
          .update({
            status: nextStatus,
            requester_email: request.requester_email ?? message.fromAddress,
            requester_name: request.requester_name ?? message.senderName,
            zoho_thread_id: request.zoho_thread_id ?? message.threadId,
            last_zoho_message_id: message.messageId,
            last_message_at: message.receivedAt,
          })
          .eq("id", request.id);
        if (updateError) throw new Error(updateError.message);
        request.status = nextStatus;
        if (!request.zoho_thread_id && message.threadId) {
          request.zoho_thread_id = message.threadId;
          byThread.set(message.threadId, request);
        }
      }

      const { error: insertMessageError } = await supabaseAdmin.from("account_support_messages").insert({
        request_id: request.id,
        direction: "incoming",
        channel: "email",
        sender_email: message.fromAddress,
        sender_name: message.senderName,
        recipient_email: "admin@tipulinks.co.il",
        body,
        zoho_message_id: message.messageId,
        zoho_thread_id: message.threadId,
        has_attachment: message.hasAttachment,
        occurred_at: message.receivedAt,
      });
      if (insertMessageError) {
        if (insertMessageError.code === "23505") continue;
        throw new Error(insertMessageError.message);
      }
      knownMessageIds.add(message.messageId);
      imported += 1;
    }

    return { imported, checked: incoming.length };
  });
