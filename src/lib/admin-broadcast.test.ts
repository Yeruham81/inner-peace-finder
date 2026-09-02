import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const route = read("src/routes/admin/broadcasts.tsx");
const functions = read("src/lib/admin-broadcast.functions.ts");
const server = read("src/lib/admin-broadcast.server.ts");
const surface = read("src/components/site-announcement-surface.tsx");
const migration = read("supabase/migrations/20260902210000_admin_broadcasts.sql");
const nav = read("src/components/admin/admin-nav.ts");
const rootRoute = read("src/routes/__root.tsx");
const recruitmentWebhook = read("src/routes/api/public/email/recruitment-status.ts");


describe("admin broadcasts", () => {
  it("adds a dedicated admin screen with authenticated admin-only operations", () => {
    expect(nav).toContain('{ to: "/admin/broadcasts", label: "הודעות ועדכונים"');
    expect(route).toContain('createFileRoute("/admin/broadcasts")');
    expect(functions.match(/\.middleware\(\[requireSupabaseAuth\]\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(functions.match(/requireTipulinksAdmin\(context\.claims/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("supports the approved audience slices and previews recipients before sending", () => {
    for (const value of ["all_registered", "therapists", "verified", "pending", "not_verified", "completed", "incomplete", "active", "missing"]) {
      expect(route).toContain(value);
    }
    expect(route).toContain("חשב והצג נמענים");
    expect(route).toContain("הצגת נמענים");
    expect(server).toContain("resolveBroadcastAudience");
  });

  it("keeps Hebrew authoring, previews and delivered email content RTL/right aligned", () => {
    expect(route).toContain('dir="rtl"');
    expect(route).toContain('className="text-right"');
    expect(server).toContain('dir="rtl"');
    expect(server).toContain("direction:rtl;text-align:right");
    expect(surface).toContain('dir="rtl"');
    expect(surface).toContain("text-right");
  });

  it("implements a dismiss-once modal and a non-dismissible banner with expiry", () => {
    expect(route).toContain("חלונית — ניתנת לסגירה ולא תופיע שוב");
    expect(route).toContain("באנר — קבוע עד מועד התפוגה");
    expect(migration).toContain("user_announcement_dismissals");
    expect(migration).toContain("site_banner_expiry_required");
    expect(surface).toContain('announcement.displayType === "banner"');
    expect(surface).toContain("dismissMutation.mutate(modal.id)");
    expect(surface).not.toContain("dismissMutation.mutate(announcement.id)");
  });

  it("snapshots recipients and tracks email delivery/open/failure state", () => {
    expect(migration).toContain("admin_broadcast_recipients");
    expect(migration).toContain("provider_message_id");
    expect(server).toContain("applyBroadcastBrevoWebhook");
    expect(server).toContain("delivered_count");
    expect(server).toContain("opened_count");
    expect(server).toContain("failed_count");
  });

  it("protects scheduled sends from accidental duplicate submission and supports cancellation", () => {
    expect(migration).toContain("client_request_id uuid not null unique");
    expect(server).toContain("client_request_id");
    expect(route).toContain("אישור הפצה");
    expect(server).toContain("cancelBroadcastCampaign");
    expect(server).toContain("/v3/smtp/email/");
  });

  it("renders announcements globally for authenticated users", () => {
    expect(rootRoute.match(/<SiteAnnouncementSurface \/>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(surface).toContain("getMyActiveSiteAnnouncements");
    expect(surface).toContain("supabase.auth.getSession");
  });

  it("keeps broadcast tables private and sends marketing email through Brevo Marketing Campaigns", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.admin_broadcast_campaigns from public, anon, authenticated");
    expect(functions).not.toContain('value.category === "marketing" && value.channels.includes("email")');
    expect(server).toContain('args.category !== "operational"');
    expect(server).toContain('brevoRequest("/emailCampaigns"');
    expect(server).toContain('/sendNow`');
    expect(server).toContain('recipients: { listIds: [input.listId] }');
    expect(server).toContain('{{ unsubscribe }}');
    expect(migration).toContain("brevo_campaign_id bigint null");
    expect(migration).toContain("brevo_list_id bigint null");
    expect(route).toContain("Brevo Marketing Campaigns");
    expect(recruitmentWebhook).toContain("applyBroadcastBrevoWebhook");
  });

  it("places broadcasts immediately above system settings in the admin menu", () => {
    const broadcasts = nav.indexOf('{ to: "/admin/broadcasts", label: "הודעות ועדכונים"');
    const settings = nav.indexOf('{ to: "/admin/settings", label: "הגדרות מערכת"');
    expect(broadcasts).toBeGreaterThan(-1);
    expect(settings).toBeGreaterThan(broadcasts);
    const broadcastLineEnd = nav.indexOf("\n", broadcasts);
    expect(nav.slice(broadcastLineEnd, settings)).not.toContain('{ to: "/admin/');
  });
});
