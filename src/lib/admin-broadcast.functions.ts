import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTipulinksAdmin } from "./admin-permissions";
import type {
  ActiveSiteAnnouncement,
  AdminBroadcastCampaignRow,
  BroadcastAudiencePreview,
} from "./admin-broadcast.types";

const AudienceSchema = z.object({
  scope: z.enum(["all_registered", "therapists"]),
  profileStatuses: z.array(z.enum(["draft", "completed", "published"])).max(3),
  verification: z.enum(["any", "verified", "pending", "not_verified"]),
  onboarding: z.enum(["any", "completed", "incomplete"]),
  payment: z.enum(["any", "active", "missing"]),
});

const ContentSchema = z.object({
  category: z.enum(["operational", "product", "marketing"]),
  title: z.string().trim().min(1, "נא להזין כותרת.").max(160, "הכותרת ארוכה מדי."),
  emailSubject: z.string().trim().max(180, "נושא האימייל ארוך מדי.").nullable(),
  body: z.string().trim().min(1, "נא להזין תוכן להודעה.").max(12000, "תוכן ההודעה ארוך מדי."),
  ctaLabel: z.string().trim().max(80, "טקסט הכפתור ארוך מדי.").nullable(),
  ctaUrl: z.string().trim().max(1000, "הקישור ארוך מדי.").nullable(),
});

const PreviewSchema = z.object({
  audience: AudienceSchema,
  category: z.enum(["operational", "product", "marketing"]),
});

const CreateSchema = ContentSchema.extend({
  clientRequestId: z.string().uuid(),
  channels: z.array(z.enum(["email", "site"])).min(1, "יש לבחור לפחות ערוץ הפצה אחד.").max(2),
  siteDisplayType: z.enum(["modal", "banner"]).nullable(),
  audience: AudienceSchema,
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
}).superRefine((value, ctx) => {
  if (value.channels.includes("email") && !value.emailSubject) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["emailSubject"], message: "נא להזין נושא לאימייל." });
  }
  if (value.channels.includes("site") && !value.siteDisplayType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["siteDisplayType"], message: "יש לבחור סוג הודעה באתר." });
  }
  if (value.siteDisplayType === "banner" && !value.expiresAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "לבאנר חובה להגדיר מועד תפוגה." });
  }
  if ((value.ctaLabel && !value.ctaUrl) || (!value.ctaLabel && value.ctaUrl)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ctaLabel"], message: "יש למלא גם טקסט וגם קישור לכפתור." });
  }
});

const CampaignIdSchema = z.object({ campaignId: z.string().uuid() });
const AnnouncementIdSchema = z.object({ announcementId: z.string().uuid() });

export const previewAdminBroadcastAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreviewSchema.parse(input))
  .handler(async ({ data, context }): Promise<BroadcastAudiencePreview> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בקהל הודעות.");
    const { previewBroadcastAudience } = await import("./admin-broadcast.server");
    return previewBroadcastAudience(data.audience, data.category);
  });

export const createAdminBroadcastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשליחת הודעות.");
    const { createBroadcastCampaign } = await import("./admin-broadcast.server");
    return createBroadcastCampaign(data, context.userId);
  });

export const sendAdminBroadcastTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ContentSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לשליחת הודעת בדיקה.");
    const { sendBroadcastTest } = await import("./admin-broadcast.server");
    return { email: await sendBroadcastTest(data, context.userId) };
  });

export const listAdminBroadcastCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminBroadcastCampaignRow[]> => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לצפייה בהיסטוריית הודעות.");
    const { listBroadcastCampaigns } = await import("./admin-broadcast.server");
    return listBroadcastCampaigns();
  });

export const cancelAdminBroadcastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CampaignIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requireTipulinksAdmin(context.claims, "אין הרשאת מנהל לביטול הודעה מתוזמנת.");
    const { cancelBroadcastCampaign } = await import("./admin-broadcast.server");
    await cancelBroadcastCampaign(data.campaignId);
    return { ok: true as const };
  });

export const getMyActiveSiteAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActiveSiteAnnouncement[]> => {
    const { listActiveSiteAnnouncements } = await import("./admin-broadcast.server");
    return listActiveSiteAnnouncements(context.userId);
  });

export const dismissMySiteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnnouncementIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { dismissSiteAnnouncement } = await import("./admin-broadcast.server");
    await dismissSiteAnnouncement(data.announcementId, context.userId);
    return { ok: true as const };
  });

export type {
  ActiveSiteAnnouncement,
  AdminBroadcastCampaignRow,
  BroadcastAudience,
  BroadcastAudiencePreview,
  BroadcastAudienceRecipient,
  BroadcastCategory,
  BroadcastChannel,
  BroadcastOnboardingFilter,
  BroadcastPaymentFilter,
  BroadcastProfileStatus,
  BroadcastVerificationFilter,
  SiteAnnouncementDisplayType,
} from "./admin-broadcast.types";
