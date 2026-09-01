import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseRecruitmentCsv, type RecruitmentCsvRow } from "./recruitment-import";
import { requireTipulinksAdmin } from "./admin-permissions";

export type RecruitmentChannel = "email" | "sms" | "whatsapp";
export type RecruitmentInvitationStatus =
  | "ready"
  | "submitting"
  | "submitted"
  | "delivered"
  | "bounced"
  | "declined"
  | "registered"
  | "submission_failed"
  | "submission_unknown";

export type RecruitmentPreviewStatus =
  | "eligible"
  | "invalid_email"
  | "duplicate_file"
  | "already_invited"
  | "already_registered"
  | "existing_profile"
  | "suppressed";

export type AdminRecruitmentPreviewRow = {
  rowNumber: number;
  email: string;
  normalizedEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  status: RecruitmentPreviewStatus;
};

export type AdminRecruitmentPreview = {
  rows: AdminRecruitmentPreviewRow[];
  summary: {
    total: number;
    eligible: number;
    invalid: number;
    duplicateFile: number;
    alreadyInvited: number;
    alreadyRegistered: number;
    existingProfile: number;
    suppressed: number;
  };
};

export type AdminRecruitmentInvitationRow = {
  id: string;
  channel: RecruitmentChannel;
  destination: string;
  firstName: string | null;
  lastName: string | null;
  status: RecruitmentInvitationStatus;
  importBatchId: string | null;
  createdAt: string;
  submittedAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  declinedAt: string | null;
  registeredAt: string | null;
  failureReason: string | null;
};

export type AdminRecruitmentPage = {
  rows: AdminRecruitmentInvitationRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const CsvInputSchema = z.object({
  csvText: z.string().min(1).max(400_000),
  fileName: z.string().trim().min(1).max(200),
});

const ListInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]).default(25),
  search: z.string().trim().max(200).default(""),
  channel: z.enum(["email", "sms", "whatsapp"]).nullable().optional(),
  status: z
    .enum([
      "ready",
      "submitting",
      "submitted",
      "delivered",
      "bounced",
      "declined",
      "registered",
      "submission_failed",
      "submission_unknown",
    ])
    .nullable()
    .optional(),
  sortKey: z.enum(["createdAt", "destination", "status", "channel"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

const SORT_COLUMNS = {
  createdAt: "created_at",
  destination: "destination_normalized",
  status: "status",
  channel: "channel",
} as const;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function safeFilename(value: string): string {
  return value.split(/[\\/]/).pop()?.trim().slice(0, 200) || "import.csv";
}

function asChannel(value: string): RecruitmentChannel {
  if (value === "email" || value === "sms" || value === "whatsapp") return value;
  throw new Error("ערוץ הזמנה לא מוכר.");
}

function asInvitationStatus(value: string): RecruitmentInvitationStatus {
  const allowed: RecruitmentInvitationStatus[] = [
    "ready",
    "submitting",
    "submitted",
    "delivered",
    "bounced",
    "declined",
    "registered",
    "submission_failed",
    "submission_unknown",
  ];
  if (allowed.includes(value as RecruitmentInvitationStatus)) return value as RecruitmentInvitationStatus;
  throw new Error("סטטוס הזמנה לא מוכר.");
}

type EmailConflict = {
  email_normalized: string;
  already_registered: boolean;
  existing_profile: boolean;
  globally_suppressed: boolean;
};

async function buildRecruitmentPreview(csvText: string): Promise<AdminRecruitmentPreview> {
  const parsed = parseRecruitmentCsv(csvText);
  const candidates = parsed.rows
    .filter((row) => row.parseStatus === "valid" && row.normalizedEmail)
    .map((row) => row.normalizedEmail as string);

  const registered = new Set<string>();
  const profiles = new Set<string>();
  const globalSuppressions = new Set<string>();
  const recruitmentSuppressions = new Set<string>();
  const existingInvitations = new Set<string>();

  if (candidates.length > 0) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const conflictResult = await supabaseAdmin.rpc("get_recruitment_email_conflicts", { _emails: candidates });
    if (conflictResult.error) throw new Error(conflictResult.error.message);

    for (const conflict of (conflictResult.data ?? []) as unknown as EmailConflict[]) {
      if (conflict.already_registered) registered.add(conflict.email_normalized);
      if (conflict.existing_profile) profiles.add(conflict.email_normalized);
      if (conflict.globally_suppressed) globalSuppressions.add(conflict.email_normalized);
    }

    // PostgREST encodes .in() filters in the URL, so keep each request small even
    // when an admin imports the maximum supported CSV size.
    for (let start = 0; start < candidates.length; start += 100) {
      const chunk = candidates.slice(start, start + 100);
      const [suppressionResult, invitationResult] = await Promise.all([
        supabaseAdmin
          .from("therapist_recruitment_suppressions")
          .select("destination_normalized")
          .eq("channel", "email")
          .in("destination_normalized", chunk),
        supabaseAdmin
          .from("therapist_recruitment_invitations")
          .select("destination_normalized")
          .eq("channel", "email")
          .in("destination_normalized", chunk),
      ]);

      if (suppressionResult.error) throw new Error(suppressionResult.error.message);
      if (invitationResult.error) throw new Error(invitationResult.error.message);

      for (const row of suppressionResult.data ?? []) recruitmentSuppressions.add(row.destination_normalized);
      for (const row of invitationResult.data ?? []) existingInvitations.add(row.destination_normalized);
    }
  }

  const rows = parsed.rows.map((row): AdminRecruitmentPreviewRow => {
    if (row.parseStatus === "invalid_email") return previewRow(row, "invalid_email");
    if (row.parseStatus === "duplicate_file") return previewRow(row, "duplicate_file");

    const email = row.normalizedEmail!;
    if (registered.has(email)) return previewRow(row, "already_registered");
    if (profiles.has(email)) return previewRow(row, "existing_profile");
    if (globalSuppressions.has(email) || recruitmentSuppressions.has(email)) return previewRow(row, "suppressed");
    if (existingInvitations.has(email)) return previewRow(row, "already_invited");
    return previewRow(row, "eligible");
  });

  return {
    rows,
    summary: {
      total: rows.length,
      eligible: countStatus(rows, "eligible"),
      invalid: countStatus(rows, "invalid_email"),
      duplicateFile: countStatus(rows, "duplicate_file"),
      alreadyInvited: countStatus(rows, "already_invited"),
      alreadyRegistered: countStatus(rows, "already_registered"),
      existingProfile: countStatus(rows, "existing_profile"),
      suppressed: countStatus(rows, "suppressed"),
    },
  };
}

function previewRow(row: RecruitmentCsvRow, status: RecruitmentPreviewStatus): AdminRecruitmentPreviewRow {
  return {
    rowNumber: row.rowNumber,
    email: row.email,
    normalizedEmail: row.normalizedEmail,
    firstName: row.firstName,
    lastName: row.lastName,
    status,
  };
}

function countStatus(rows: AdminRecruitmentPreviewRow[], status: RecruitmentPreviewStatus): number {
  return rows.reduce((count, row) => count + (row.status === status ? 1 : 0), 0);
}

export const previewAdminRecruitmentCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CsvInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminRecruitmentPreview> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לייבוא הזמנות מטפלים.");
    return buildRecruitmentPreview(data.csvText);
  });

export const importAdminRecruitmentCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CsvInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לייבוא הזמנות מטפלים.");
    const preview = await buildRecruitmentPreview(data.csvText);
    const eligibleRows = preview.rows.filter((row) => row.status === "eligible" && row.normalizedEmail);

    if (eligibleRows.length === 0) {
      return { batchId: null, importedCount: 0, preview };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminUserId = context.userId;
    if (!adminUserId || typeof adminUserId !== "string") throw new Error("לא ניתן לזהות את חשבון המנהל.");

    const batchInsert = await supabaseAdmin
      .from("therapist_recruitment_import_batches")
      .insert({
        channel: "email",
        source_filename: safeFilename(data.fileName),
        created_by: adminUserId,
        total_rows: preview.summary.total,
        eligible_rows: preview.summary.eligible,
        imported_rows: 0,
        invalid_rows: preview.summary.invalid,
        duplicate_rows: preview.summary.duplicateFile,
        already_invited_rows: preview.summary.alreadyInvited,
        already_registered_rows: preview.summary.alreadyRegistered,
        existing_profile_rows: preview.summary.existingProfile,
        suppressed_rows: preview.summary.suppressed,
      })
      .select("id")
      .single();

    if (batchInsert.error || !batchInsert.data) {
      throw new Error(batchInsert.error?.message || "לא ניתן ליצור אצוות ייבוא.");
    }

    const batchId = (batchInsert.data as unknown as { id: string }).id;
    const invitationPayload = eligibleRows.map((row) => ({
      import_batch_id: batchId,
      channel: "email",
      destination_normalized: row.normalizedEmail!,
      first_name: row.firstName,
      last_name: row.lastName,
      status: "ready",
    }));

    const invitationInsert = await supabaseAdmin
      .from("therapist_recruitment_invitations")
      .upsert(invitationPayload, {
        onConflict: "channel,destination_normalized",
        ignoreDuplicates: true,
      })
      .select("id");

    if (invitationInsert.error) {
      await supabaseAdmin.from("therapist_recruitment_import_batches").delete().eq("id", batchId);
      throw new Error(invitationInsert.error.message);
    }

    const importedCount = (invitationInsert.data ?? []).length;
    const batchUpdate = await supabaseAdmin
      .from("therapist_recruitment_import_batches")
      .update({ imported_rows: importedCount })
      .eq("id", batchId);
    if (batchUpdate.error) throw new Error(batchUpdate.error.message);

    return { batchId, importedCount, preview };
  });

export const listAdminRecruitmentInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminRecruitmentPage> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בהזמנות מטפלים.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("therapist_recruitment_invitations")
      .select(
        "id, channel, destination_normalized, first_name, last_name, status, import_batch_id, created_at, submitted_at, delivered_at, bounced_at, declined_at, registered_at, failure_reason",
        { count: "exact" },
      );

    if (data.search) {
      const pattern = `%${escapeLikePattern(data.search)}%`;
      query = query.ilike("search_text", pattern);
    }
    if (data.channel) query = query.eq("channel", data.channel);
    if (data.status) query = query.eq("status", data.status);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const result = await query
      .order(SORT_COLUMNS[data.sortKey], { ascending: data.sortDirection === "asc", nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (result.error) throw new Error(result.error.message);

    const rawRows = (result.data ?? []) as unknown as Array<Record<string, string | null>>;
    const rows: AdminRecruitmentInvitationRow[] = rawRows.map((row) => ({
      id: row.id!,
      channel: asChannel(row.channel!),
      destination: row.destination_normalized!,
      firstName: row.first_name,
      lastName: row.last_name,
      status: asInvitationStatus(row.status!),
      importBatchId: row.import_batch_id,
      createdAt: row.created_at!,
      submittedAt: row.submitted_at,
      deliveredAt: row.delivered_at,
      bouncedAt: row.bounced_at,
      declinedAt: row.declined_at,
      registeredAt: row.registered_at,
      failureReason: row.failure_reason,
    }));

    const total = result.count ?? 0;
    return {
      rows,
      total,
      page: data.page,
      pageSize: data.pageSize,
      pageCount: Math.max(1, Math.ceil(total / data.pageSize)),
    };
  });

const SendRecruitmentInputSchema = z.object({
  invitationIds: z.array(z.string().uuid()).min(1).max(100),
});

export type AdminRecruitmentEmailCapacity = {
  sendDate: string;
  used: number;
  remaining: number;
  dailyLimit: number;
};

export const getAdminRecruitmentEmailCapacity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminRecruitmentEmailCapacity> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה במכסת שליחת ההזמנות.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("get_recruitment_email_daily_capacity");
    if (result.error) throw new Error(result.error.message);
    const row = Array.isArray(result.data) ? result.data[0] : null;
    return {
      sendDate: row?.send_date ?? new Date().toISOString().slice(0, 10),
      used: Number(row?.used_count ?? 0),
      remaining: Number(row?.remaining_count ?? 0),
      dailyLimit: Number(row?.daily_limit ?? 100),
    };
  });

export const sendAdminRecruitmentEmailInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendRecruitmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשליחת הזמנות מטפלים.");
    const adminUserId = context.userId;
    if (!adminUserId) throw new Error("לא ניתן לזהות את חשבון המנהל.");

    const uniqueIds = [...new Set(data.invitationIds)];
    if (uniqueIds.length !== data.invitationIds.length) throw new Error("רשימת ההזמנות כוללת כפילויות.");

    const { reserveRecruitmentEmailInvitations, deliverRecruitmentEmailBatch } =
      await import("./recruitment-delivery.server");
    let reserved;
    try {
      reserved = await reserveRecruitmentEmailInvitations(uniqueIds, adminUserId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("recruitment_daily_limit_exceeded")) {
        throw new Error("השליחה חורגת ממכסת 100 ההזמנות היומית.");
      }
      if (message.includes("recruitment_selection_no_longer_eligible")) {
        throw new Error("חלק מהכתובות שנבחרו אינן זמינות עוד לשליחה. רעננו את הרשימה ונסו שוב.");
      }
      throw error;
    }

    const result = await deliverRecruitmentEmailBatch(reserved);
    return {
      ...result,
      selectedCount: uniqueIds.length,
    };
  });
