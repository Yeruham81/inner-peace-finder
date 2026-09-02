import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Mail, Megaphone, Monitor, Send, TestTube2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelAdminBroadcastCampaign,
  createAdminBroadcastCampaign,
  listAdminBroadcastCampaigns,
  previewAdminBroadcastAudience,
  sendAdminBroadcastTest,
  type BroadcastAudience,
  type BroadcastCategory,
  type BroadcastProfileStatus,
  type SiteAnnouncementDisplayType,
} from "@/lib/admin-broadcast.functions";

export const Route = createFileRoute("/admin/broadcasts")({
  head: () => ({
    meta: [
      { title: "הודעות ועדכונים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "שליחת הודעות ועדכונים לקבוצות משתמשים בטיפולינקס" },
    ],
  }),
  component: BroadcastsPage,
});

const CATEGORY_LABELS: Record<BroadcastCategory, string> = {
  operational: "מערכתית / תפעולית",
  product: "עדכון מוצר",
  marketing: "שיווקית / מבצע",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "מתוזמנת",
  sending: "בתהליך",
  sent: "נשלחה",
  partially_failed: "נשלחה חלקית",
  failed: "נכשלה",
  cancelled: "בוטלה",
};

const PROFILE_LABELS: Record<BroadcastProfileStatus, string> = {
  draft: "טיוטה",
  completed: "מוכן לפרסום",
  published: "פורסם",
};

function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function BroadcastsPage() {
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewAdminBroadcastAudience);
  const createFn = useServerFn(createAdminBroadcastCampaign);
  const testFn = useServerFn(sendAdminBroadcastTest);
  const listFn = useServerFn(listAdminBroadcastCampaigns);
  const cancelFn = useServerFn(cancelAdminBroadcastCampaign);

  const [category, setCategory] = useState<BroadcastCategory>("operational");
  const [title, setTitle] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [siteEnabled, setSiteEnabled] = useState(false);
  const [siteDisplayType, setSiteDisplayType] = useState<SiteAnnouncementDisplayType>("modal");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [audience, setAudience] = useState<BroadcastAudience>({
    scope: "all_registered",
    profileStatuses: [],
    verification: "any",
    onboarding: "any",
    payment: "any",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const history = useQuery({
    queryKey: ["admin-broadcast-campaigns"],
    queryFn: () => listFn(),
  });

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: { audience, category } }),
    onError: (error: Error) => toast.error(error.message || "לא ניתן לחשב את קהל היעד."),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      testFn({
        data: {
          category,
          title,
          emailSubject: emailSubject.trim() || null,
          body,
          ctaLabel: ctaLabel.trim() || null,
          ctaUrl: ctaUrl.trim() || null,
        },
      }),
    onSuccess: ({ email }) => toast.success(`הודעת בדיקה נשלחה אל ${email}.`),
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח הודעת בדיקה."),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          clientRequestId,
          category,
          title,
          emailSubject: emailEnabled ? emailSubject.trim() || null : null,
          body,
          ctaLabel: ctaLabel.trim() || null,
          ctaUrl: ctaUrl.trim() || null,
          channels: [emailEnabled ? "email" : null, siteEnabled ? "site" : null].filter(Boolean) as ("email" | "site")[],
          siteDisplayType: siteEnabled ? siteDisplayType : null,
          audience,
          scheduledAt: scheduleEnabled ? localDateTimeToIso(scheduledAt) : null,
          expiresAt: siteEnabled && expiresAt ? localDateTimeToIso(expiresAt) : null,
        },
      }),
    onSuccess: async (result) => {
      setConfirmOpen(false);
      setClientRequestId(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: ["admin-broadcast-campaigns"] });
      toast.success(result.status === "scheduled" ? "ההודעה תוזמנה בהצלחה." : "ההודעה נמסרה להפצה.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח את ההודעה."),
  });

  const cancelMutation = useMutation({
    mutationFn: (campaignId: string) => cancelFn({ data: { campaignId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-broadcast-campaigns"] });
      toast.success("ההודעה המתוזמנת בוטלה.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לבטל את ההודעה."),
  });

  const selectedChannels = Number(emailEnabled) + Number(siteEnabled);
  const preview = previewMutation.data;
  const intendedCount = Math.max(
    emailEnabled ? preview?.emailEligibleCount ?? 0 : 0,
    siteEnabled ? preview?.siteEligibleCount ?? 0 : 0,
  );
  const canOpenConfirmation =
    selectedChannels > 0 &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (!emailEnabled || emailSubject.trim().length > 0) &&
    (!siteEnabled || siteDisplayType !== "banner" || Boolean(expiresAt)) &&
    Boolean(preview) &&
    intendedCount > 0 &&
    !createMutation.isPending;

  const previewRows = useMemo(() => preview?.recipients ?? [], [preview]);

  function toggleProfileStatus(status: BroadcastProfileStatus, checked: boolean) {
    setAudience((current) => ({
      ...current,
      profileStatuses: checked
        ? [...new Set([...current.profileStatuses, status])]
        : current.profileStatuses.filter((item) => item !== status),
    }));
  }

  function audienceChanged(next: BroadcastAudience) {
    setAudience(next);
    previewMutation.reset();
  }

  return (
    <div dir="rtl" className="text-right">
      <AdminPageHeader
        title="הודעות ועדכונים"
        breadcrumb="הודעות ועדכונים"
        subtitle="שליחת אימיילים והודעות בתוך טיפולינקס לפי קהל יעד, עם תצוגה מקדימה והיסטוריית הפצה."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>יצירת הודעה</CardTitle>
              <CardDescription>כל התוכן בעברית מוצג ונשלח בכיוון RTL וביישור לימין.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">סוג ההודעה</span>
                  <Select value={category} onValueChange={(value) => { setCategory(value as BroadcastCategory); previewMutation.reset(); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">כותרת</span>
                  <Input dir="rtl" className="text-right" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">תוכן ההודעה</span>
                <Textarea dir="rtl" className="min-h-36 resize-y text-right leading-7" value={body} maxLength={12000} onChange={(event) => setBody(event.target.value)} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">טקסט לכפתור — לא חובה</span>
                  <Input dir="rtl" className="text-right" value={ctaLabel} maxLength={80} onChange={(event) => setCtaLabel(event.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">קישור לכפתור — לא חובה</span>
                  <Input dir="ltr" className="text-left" value={ctaUrl} maxLength={1000} placeholder="/account או https://..." onChange={(event) => setCtaUrl(event.target.value)} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="font-medium">אימייל דרך Brevo</p><p className="text-xs text-muted-foreground">מיועד למשתמשים עם כתובת אימייל זמינה.</p></div>
                    <Switch checked={emailEnabled} onCheckedChange={(checked) => { setEmailEnabled(checked); previewMutation.reset(); }} aria-label="שליחה באימייל" />
                  </div>
                  {category !== "operational" && <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">עדכוני מוצר והודעות שיווקיות באימייל נשלחים באמצעות Brevo Marketing Campaigns וכוללים קישור הסרה מרשימת הדיוור.</p>}
                  {emailEnabled && (
                    <label className="mt-4 block space-y-1.5">
                      <span className="text-sm font-medium">נושא האימייל</span>
                      <Input dir="rtl" className="text-right" value={emailSubject} maxLength={180} onChange={(event) => setEmailSubject(event.target.value)} />
                    </label>
                  )}
                </div>

                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="font-medium">הודעה בתוך האתר</p><p className="text-xs text-muted-foreground">מוצגת למשתמשים שנכללו בקהל בזמן הפרסום.</p></div>
                    <Switch checked={siteEnabled} onCheckedChange={(checked) => { setSiteEnabled(checked); previewMutation.reset(); }} aria-label="הודעה בתוך האתר" />
                  </div>
                  {siteEnabled && (
                    <div className="mt-4 space-y-3">
                      <Select value={siteDisplayType} onValueChange={(value) => setSiteDisplayType(value as SiteAnnouncementDisplayType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="modal">חלונית — ניתנת לסגירה ולא תופיע שוב</SelectItem>
                          <SelectItem value="banner">באנר — קבוע עד מועד התפוגה</SelectItem>
                        </SelectContent>
                      </Select>
                      {siteDisplayType === "banner" && <p className="text-xs text-muted-foreground">לבאנר אין כפתור סגירה. הוא נעלם אוטומטית במועד התפוגה.</p>}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>קהל יעד</CardTitle>
              <CardDescription>הקהל מחושב מחדש גם ברגע השליחה ונשמר כ-snapshot בהיסטוריה.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">סוג משתמש</span>
                  <Select value={audience.scope} onValueChange={(value) => audienceChanged({ ...audience, scope: value as BroadcastAudience["scope"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all_registered">כל המשתמשים הרשומים</SelectItem><SelectItem value="therapists">מטפלים בלבד</SelectItem></SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">אימות הסמכה</span>
                  <Select value={audience.verification} onValueChange={(value) => audienceChanged({ ...audience, verification: value as BroadcastAudience["verification"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="any">הכול</SelectItem><SelectItem value="verified">מאומת</SelectItem><SelectItem value="pending">ממתין לבדיקה</SelectItem><SelectItem value="not_verified">ללא אימות</SelectItem></SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">השלמת הצטרפות</span>
                  <Select value={audience.onboarding} onValueChange={(value) => audienceChanged({ ...audience, onboarding: value as BroadcastAudience["onboarding"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="any">הכול</SelectItem><SelectItem value="completed">הושלמה</SelectItem><SelectItem value="incomplete">לא הושלמה</SelectItem></SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">אמצעי תשלום</span>
                  <Select value={audience.payment} onValueChange={(value) => audienceChanged({ ...audience, payment: value as BroadcastAudience["payment"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="any">הכול</SelectItem><SelectItem value="active">קיים ופעיל</SelectItem><SelectItem value="missing">חסר / לא פעיל</SelectItem></SelectContent>
                  </Select>
                </label>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">מצב פרופיל — ללא בחירה = הכול</p>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(PROFILE_LABELS) as BroadcastProfileStatus[]).map((status) => (
                    <label key={status} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <Checkbox checked={audience.profileStatuses.includes(status)} onCheckedChange={(checked) => { toggleProfileStatus(status, checked === true); previewMutation.reset(); }} />
                      {PROFILE_LABELS[status]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                  <UsersRound className="h-4 w-4" /> {previewMutation.isPending ? "מחשב קהל…" : "חשב והצג נמענים"}
                </Button>
                {preview && (
                  <div className="text-sm">
                    <strong>{preview.totalCount}</strong> משתמשים בקהל · אימייל: <strong>{preview.emailEligibleCount}</strong> · באתר: <strong>{preview.siteEligibleCount}</strong>
                  </div>
                )}
              </div>

              {previewRows.length > 0 && (
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer font-medium">הצגת נמענים</summary>
                  <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-secondary"><tr><th className="p-2 text-right">שם</th><th className="p-2 text-right">אימייל</th><th className="p-2 text-right">פרופיל</th></tr></thead>
                      <tbody>{previewRows.map((recipient) => <tr key={recipient.authUserId} className="border-t"><td className="p-2">{recipient.displayName || "—"}</td><td className="p-2" dir="ltr">{recipient.email}</td><td className="p-2">{recipient.profileStatus ? PROFILE_LABELS[recipient.profileStatus] : "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                  {preview?.recipientsTruncated && <p className="mt-2 text-xs text-muted-foreground">מוצגים 200 הנמענים הראשונים. הספירה המלאה משמשת לשליחה.</p>}
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>מועד הפצה</CardTitle><CardDescription>הודעות באתר מופעלות אוטומטית לפי מועד ההתחלה. עדכוני מוצר והודעות שיווקיות מתוזמנים דרך Brevo Marketing Campaigns; רק אימיילים מערכתיים/תפעוליים משתמשים במסלול הטרנזקציוני וניתנים לתזמון עד 72 שעות מראש.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-medium">שליחה במועד עתידי</p><p className="text-xs text-muted-foreground">כבוי = שליחה מיידית.</p></div><Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} /></div>
              <div className="grid gap-4 md:grid-cols-2">
                {scheduleEnabled && <label className="space-y-1.5"><span className="text-sm font-medium">מועד התחלה</span><Input type="datetime-local" dir="ltr" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}
                {siteEnabled && <label className="space-y-1.5"><span className="text-sm font-medium">מועד תפוגה {siteDisplayType === "banner" ? "(חובה)" : "(לא חובה)"}</span><Input type="datetime-local" dir="ltr" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            {emailEnabled && <Button type="button" variant="outline" disabled={testMutation.isPending || !title.trim() || !body.trim() || !emailSubject.trim()} onClick={() => testMutation.mutate()}><TestTube2 className="h-4 w-4" />{testMutation.isPending ? "שולח בדיקה…" : "שליחת הודעת בדיקה אליי"}</Button>}
            <Button type="button" disabled={!canOpenConfirmation} onClick={() => setConfirmOpen(true)}><Send className="h-4 w-4" />{scheduleEnabled ? "תזמון ההודעה" : "שליחת ההודעה"}</Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader><CardTitle>תצוגה מקדימה</CardTitle><CardDescription>כך ייראה התוכן בעברית, ביישור לימין.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {emailEnabled && <div className="rounded-xl border bg-white p-4 text-right" dir="rtl"><div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-4 w-4" />אימייל</div><p className="text-xs text-muted-foreground">{emailSubject || "נושא האימייל"}</p><h3 className="mt-3 text-lg font-bold">{title || "כותרת ההודעה"}</h3><p className="mt-3 whitespace-pre-line text-sm leading-7">{body || "תוכן ההודעה יוצג כאן."}</p>{ctaLabel && ctaUrl && <span className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{ctaLabel}</span>}</div>}
              {siteEnabled && <div className="rounded-xl border bg-brand-soft/40 p-4 text-right" dir="rtl"><div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Monitor className="h-4 w-4" />{siteDisplayType === "banner" ? "באנר קבוע" : "חלונית חד-פעמית"}</div><h3 className="font-bold">{title || "כותרת ההודעה"}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6">{body || "תוכן ההודעה יוצג כאן."}</p>{siteDisplayType === "modal" && <p className="mt-3 text-xs text-muted-foreground">לאחר סגירה החלונית לא תוצג שוב לאותו משתמש.</p>}{siteDisplayType === "banner" && <p className="mt-3 text-xs text-muted-foreground">הבאנר אינו ניתן לסגירה ויופיע עד מועד התפוגה.</p>}</div>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-8">
        <CardHeader><CardTitle>היסטוריית הודעות</CardTitle><CardDescription>הקהל והסטטוסים נשמרים לפי מצבם בזמן ההפצה.</CardDescription></CardHeader>
        <CardContent>
          {history.isLoading ? <p className="text-sm text-muted-foreground">טוען היסטוריה…</p> : history.isError ? <p className="text-sm text-destructive">לא ניתן לטעון את היסטוריית ההודעות.</p> : history.data?.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b"><th className="p-2 text-right">הודעה</th><th className="p-2 text-right">סוג</th><th className="p-2 text-right">ערוצים</th><th className="p-2 text-right">קהל</th><th className="p-2 text-right">נמסרו</th><th className="p-2 text-right">נפתחו</th><th className="p-2 text-right">נכשלו</th><th className="p-2 text-right">סטטוס</th><th className="p-2 text-right">מועד</th><th className="p-2" /></tr></thead><tbody>{history.data.map((campaign) => <tr key={campaign.id} className="border-b align-top"><td className="p-2 font-medium"><div>{campaign.title}</div><details className="mt-1 font-normal"><summary className="cursor-pointer text-xs text-muted-foreground">הצגת תוכן וקהל</summary><div className="mt-2 max-w-md rounded-lg border bg-secondary/30 p-3 text-right" dir="rtl"><p className="whitespace-pre-line text-xs leading-5">{campaign.body}</p><p className="mt-2 text-[11px] text-muted-foreground">קהל: {campaign.audience.scope === "all_registered" ? "כל המשתמשים הרשומים" : "מטפלים"}</p></div></details></td><td className="p-2">{CATEGORY_LABELS[campaign.category]}</td><td className="p-2">{campaign.channels.map((channel) => channel === "email" ? "אימייל" : campaign.siteDisplayType === "banner" ? "באנר" : "חלונית").join(" + ")}</td><td className="p-2">{campaign.recipientCount}</td><td className="p-2">{campaign.deliveredCount}</td><td className="p-2">{campaign.openedCount}</td><td className="p-2">{campaign.failedCount}</td><td className="p-2"><AdminStatusBadge status={STATUS_LABELS[campaign.status] || campaign.status} /></td><td className="p-2">{new Date(campaign.scheduledAt || campaign.createdAt).toLocaleString("he-IL")}</td><td className="p-2">{campaign.status === "scheduled" && <Button size="sm" variant="outline" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate(campaign.id)}>ביטול</Button>}</td></tr>)}</tbody></table></div>
          ) : <p className="text-sm text-muted-foreground">עדיין לא נשלחו הודעות.</p>}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right"><AlertDialogTitle className="text-right">אישור הפצה</AlertDialogTitle><AlertDialogDescription className="text-right leading-6">ההודעה תופץ לקהל שנבחר. {emailEnabled && `באימייל: ${preview?.emailEligibleCount ?? 0} נמענים. `}{siteEnabled && `באתר: ${preview?.siteEligibleCount ?? 0} משתמשים.`} {audience.scope === "all_registered" ? "נבחר קהל של כלל המשתמשים הרשומים." : ""}</AlertDialogDescription></AlertDialogHeader>
          <div className="rounded-lg border bg-secondary/50 p-3 text-sm"><p className="font-semibold">{title}</p><p className="mt-1 text-muted-foreground">{scheduleEnabled ? <><CalendarClock className="ml-1 inline h-4 w-4" />הפצה מתוזמנת</> : <><Megaphone className="ml-1 inline h-4 w-4" />הפצה מיידית</>}</p></div>
          <AlertDialogFooter><AlertDialogCancel>חזרה</AlertDialogCancel><AlertDialogAction disabled={createMutation.isPending} onClick={(event) => { event.preventDefault(); createMutation.mutate(); }}>{createMutation.isPending ? "שולח…" : scheduleEnabled ? "אישור תזמון" : "אישור ושליחה"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
