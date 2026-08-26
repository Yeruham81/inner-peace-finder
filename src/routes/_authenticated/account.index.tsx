import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  Eye,
  MessageSquareText,
  MousePointerClick,
  Search,
  UserRoundPen,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { AccountStatCard } from "@/components/account/account-stat-card";
import { ProfileOnboardingCard } from "@/components/account/profile-onboarding-card";
import {
  ACCOUNT_MOCK_CHANNELS,
  ACCOUNT_MOCK_DAILY,
  ACCOUNT_MOCK_LEADS,
  ACCOUNT_MOCK_SUMMARY,
} from "@/components/account/account-mock-data";
import { Button } from "@/components/ui/button";
import {
  accountChannelLabel,
  accountLeadStatusLabel,
  formatAccountActivityDate,
  formatAgorot,
  formatChartDay,
  percentageChange,
} from "@/lib/account-activity";
import { getMyAccountDashboard } from "@/lib/account-activity.functions";
import { getMyProfileOnboarding, publishMyProfile } from "@/lib/profile-onboarding.functions";
import { setMyProfileVisibility } from "@/lib/therapist-profile.functions";
import { ensureTherapistAccount } from "@/lib/therapist-accounts.functions";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({
    meta: [{ title: "סקירה | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountOverviewPage,
});

function AccountOverviewPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const ensureFn = useServerFn(ensureTherapistAccount);
  const getOnboardingFn = useServerFn(getMyProfileOnboarding);
  const getDashboardFn = useServerFn(getMyAccountDashboard);
  const publishProfileFn = useServerFn(publishMyProfile);
  const setVisibilityFn = useServerFn(setMyProfileVisibility);
  const [showExample, setShowExample] = useState(false);

  // Use the idempotent ensure call as the account query itself. This avoids a
  // first-visit race where a separate read can finish before account creation.
  const accountQuery = useQuery({
    queryKey: ["therapist-account", user.id],
    queryFn: () => ensureFn(),
  });
  const { data: account, isLoading, isError } = accountQuery;
  const onboardingQuery = useQuery({
    queryKey: ["profile-onboarding", user.id],
    queryFn: () => getOnboardingFn(),
    enabled: Boolean(account),
  });
  const dashboardQuery = useQuery({
    queryKey: ["my-account-dashboard", user.id],
    queryFn: () => getDashboardFn(),
    enabled: Boolean(account?.owned_therapist_id),
  });

  const refreshProfileState = () => {
    queryClient.invalidateQueries({ queryKey: ["profile-onboarding"] });
    queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    queryClient.invalidateQueries({ queryKey: ["therapist-account"] });
    queryClient.invalidateQueries({ queryKey: ["therapist"] });
  };

  const publishMutation = useMutation({
    mutationFn: () => publishProfileFn(),
    onSuccess: () => {
      toast.success("הפרופיל פורסם בהצלחה.");
      refreshProfileState();
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לפרסם את הפרופיל."),
  });

  const visibilityMutation = useMutation({
    mutationFn: (visible: boolean) => setVisibilityFn({ data: { visible } }),
    onSuccess: (result) => {
      toast.success(result.visibility === "visible" ? "הפרופיל הופעל מחדש." : "הפרופיל הוקפא.");
      refreshProfileState();
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את מצב הפרופיל."),
  });

  const realSummary = dashboardQuery.data?.summary;
  const hasRealActivity = Boolean(
    realSummary &&
    (realSummary.impressions || realSummary.profile_views || realSummary.leads || realSummary.charges_agorot),
  );
  const summary = showExample
    ? {
        impressions: ACCOUNT_MOCK_SUMMARY.impressions,
        previous_impressions: 1088,
        profile_views: ACCOUNT_MOCK_SUMMARY.profileViews,
        previous_profile_views: 157,
        unique_profile_views: ACCOUNT_MOCK_SUMMARY.uniqueViews,
        previous_unique_profile_views: 126,
        leads: ACCOUNT_MOCK_SUMMARY.leads,
        previous_leads: 19,
        charges_agorot: ACCOUNT_MOCK_SUMMARY.charges * 100,
        previous_charges_agorot: 175 * 100,
      }
    : (realSummary ?? emptySummary());

  const chartData = useMemo(
    () =>
      showExample
        ? ACCOUNT_MOCK_DAILY.map((day) => ({ ...day, profile_views: day.views }))
        : (dashboardQuery.data?.daily ?? []).map((day) => ({
            ...day,
            day: formatChartDay(day.date),
            views: day.profile_views,
          })),
    [dashboardQuery.data?.daily, showExample],
  );

  const channelData = useMemo(() => {
    if (showExample) return ACCOUNT_MOCK_CHANNELS;
    const raw = dashboardQuery.data?.channels ?? [];
    const total = raw.reduce((sum, item) => sum + item.count, 0);
    return raw
      .filter((item) => item.channel !== "other" || item.count > 0)
      .map((item) => ({
        channel: accountChannelLabel(item.channel),
        count: item.count,
        share: total ? Math.round((item.count / total) * 100) : 0,
      }));
  }, [dashboardQuery.data?.channels, showExample]);

  const recentLeads = useMemo(() => {
    if (showExample) {
      return ACCOUNT_MOCK_LEADS.slice(0, 4).map((lead) => ({
        id: lead.id,
        channel: lead.channel,
        date: lead.date,
        time: lead.time,
        status: lead.status,
        chargeAgorot: lead.charge * 100,
      }));
    }
    return (dashboardQuery.data?.recent_leads ?? []).map((lead) => {
      const timestamp = formatAccountActivityDate(lead.created_at);
      return {
        id: lead.id,
        channel: accountChannelLabel(lead.channel),
        date: timestamp.date,
        time: timestamp.time,
        status: accountLeadStatusLabel(lead.delivery_status, lead.channel),
        chargeAgorot: lead.charge_agorot,
      };
    });
  }, [dashboardQuery.data?.recent_leads, showExample]);

  return (
    <>
      <AccountPageHeader
        eyebrow="מרכז הניהול"
        title="סקירה"
        description="כל מה שחשוב לדעת על ביצועי הפרופיל שלך. הנתונים מתייחסים ל-30 הימים האחרונים."
        action={
          showExample ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">
              תצוגת דוגמה
            </span>
          ) : undefined
        }
      />

      {!isLoading && !isError && account && (
        <div className="mb-6">
          {onboardingQuery.isLoading ? (
            <div className="rounded-2xl border border-border bg-surface-elevated p-6 text-sm text-muted-foreground shadow-card">
              טוען את שלבי ההצטרפות…
            </div>
          ) : onboardingQuery.isError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-card">
              <p className="text-sm font-medium text-destructive">לא הצלחנו לטעון את שלבי ההצטרפות.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void onboardingQuery.refetch()}
              >
                ניסיון חוזר
              </Button>
            </div>
          ) : onboardingQuery.data ? (
            <ProfileOnboardingCard
              status={onboardingQuery.data}
              actionPending={publishMutation.isPending || visibilityMutation.isPending}
              onPublish={() => publishMutation.mutateAsync()}
              onVisibilityChange={(visible) => visibilityMutation.mutateAsync(visible)}
            />
          ) : null}
        </div>
      )}

      {!isLoading && !isError && account && !account.owned_therapist_id && (
        <NoProfileState email={user.email ?? ""} accountStatus={statusLabel(account.account_status)} />
      )}

      {!isLoading && !isError && account?.owned_therapist_id && dashboardQuery.isLoading && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-6 text-sm text-muted-foreground shadow-card">
          טוען את נתוני הפעילות…
        </div>
      )}

      {!isLoading && !isError && account?.owned_therapist_id && dashboardQuery.isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-card">
          <p className="text-sm font-medium text-destructive">לא הצלחנו לטעון את נתוני הפעילות.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void dashboardQuery.refetch()}
          >
            ניסיון חוזר
          </Button>
        </div>
      )}

      {!isLoading && !isError && account?.owned_therapist_id && dashboardQuery.isSuccess && (
        <div className="space-y-6">
          {!hasRealActivity && !showExample && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/20 bg-brand-soft/40 p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">נתוני הפעילות יתחילו להצטבר עם פרסום הפרופיל</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  כרגע יוצגו ערכי אפס. אפשר לפתוח תצוגת דוגמה כדי לראות כיצד הסקירה תיראה לאחר שתצטבר פעילות.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowExample(true)}>
                הצגת דוגמה
              </Button>
            </div>
          )}

          {showExample && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <span>הנתונים הבאים הם להמחשה בלבד ואינם נשמרים או משויכים לחשבון.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowExample(false)}>
                חזרה לנתונים שלי
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccountStatCard
              label="הופעות בתוצאות"
              value={summary.impressions.toLocaleString("he-IL")}
              detail="לעומת 30 הימים הקודמים"
              change={percentageChange(summary.impressions, summary.previous_impressions)}
              icon={Search}
            />
            <AccountStatCard
              label="צפיות בפרופיל"
              value={summary.profile_views.toLocaleString("he-IL")}
              detail={`${summary.unique_profile_views.toLocaleString("he-IL")} מבקרים ייחודיים`}
              change={percentageChange(summary.profile_views, summary.previous_profile_views)}
              icon={Eye}
            />
            <AccountStatCard
              label="פניות"
              value={summary.leads.toLocaleString("he-IL")}
              detail="מכל אמצעי התקשורת"
              change={percentageChange(summary.leads, summary.previous_leads)}
              icon={MessageSquareText}
            />
            <AccountStatCard
              label="חיובים"
              value={formatAgorot(summary.charges_agorot)}
              detail="ב-30 הימים האחרונים"
              change={percentageChange(summary.charges_agorot, summary.previous_charges_agorot)}
              icon={CreditCard}
            />
          </div>

          <AccountSectionCard
            title="מסלול החשיפה לפנייה"
            description="כך משתמשים מתקדמים מהופעה בתוצאות החיפוש ועד ליצירת קשר."
          >
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
              <FunnelStep
                icon={Search}
                value={summary.impressions.toLocaleString("he-IL")}
                label="הופעות בתוצאות"
                note={summary.impressions ? "100%" : "טרם נצברו נתונים"}
              />
              <ArrowLeft className="mx-auto hidden h-5 w-5 text-muted-foreground md:block" />
              <FunnelStep
                icon={MousePointerClick}
                value={summary.profile_views.toLocaleString("he-IL")}
                label="צפיות בפרופיל"
                note={conversionNote(summary.profile_views, summary.impressions, "מההופעות")}
              />
              <ArrowLeft className="mx-auto hidden h-5 w-5 text-muted-foreground md:block" />
              <FunnelStep
                icon={MessageSquareText}
                value={summary.leads.toLocaleString("he-IL")}
                label="פניות"
                note={conversionNote(summary.leads, summary.profile_views, "מהצפיות")}
              />
            </div>
          </AccountSectionCard>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.75fr)]">
            <AccountSectionCard
              title="ביצועים ב-30 הימים האחרונים"
              description="הופעות בתוצאות וצפיות בפרופיל לאורך התקופה."
            >
              <div className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="accountImpressions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        borderColor: "var(--border)",
                        direction: "rtl",
                      }}
                      formatter={(value, name) => [value, name === "impressions" ? "הופעות" : "צפיות"]}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="impressions"
                      stroke="var(--brand)"
                      strokeWidth={2}
                      fill="url(#accountImpressions)"
                    />
                    <Area type="monotone" dataKey="views" stroke="var(--primary)" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground" dir="rtl">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand" /> הופעות בתוצאות
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" /> צפיות בפרופיל
                </span>
              </div>
            </AccountSectionCard>

            <AccountSectionCard title="פניות לפי ערוץ" description="חלוקת הפניות ב-30 הימים האחרונים.">
              {summary.leads === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">הפילוח יוצג לאחר קבלת הפנייה הראשונה.</p>
              ) : (
                <div className="space-y-5">
                  {channelData.map((item) => (
                    <div key={item.channel}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-foreground">{item.channel}</span>
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground ltr-num">{item.count}</span> פניות ·{" "}
                          <span className="ltr-num">{item.share}%</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${item.share}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccountSectionCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AccountSectionCard
              title="פניות אחרונות"
              description="הפניות האחרונות שהתקבלו דרך הפרופיל."
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/account/leads">לכל הפניות</Link>
                </Button>
              }
            >
              {recentLeads.length ? (
                <div className="divide-y divide-border/70">
                  {recentLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">פנייה ב-{lead.channel}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {lead.date} · {lead.time} · {lead.status}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground ltr-num">
                        {lead.chargeAgorot ? formatAgorot(lead.chargeAgorot) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">הפניות האחרונות יופיעו כאן.</p>
              )}
            </AccountSectionCard>

            <AccountSectionCard title="מצב הפרופיל" description="קיצורי דרך לניהול הנראות והאמינות של הפרופיל.">
              <div className="space-y-3">
                <QuickStatusRow
                  icon={UserRoundPen}
                  title="הפרופיל מקושר לחשבון"
                  description="ניתן לערוך, לשמור ולהציג תצוגה מקדימה בכל עת."
                  actionLabel="עריכת פרופיל"
                  to="/account/profile"
                />
                <QuickStatusRow
                  icon={BadgeCheck}
                  title="אימות הסמכות"
                  description="נהלו מסמכים מקצועיים ובדקו את סטטוס האימות."
                  actionLabel="ניהול הסמכות"
                  to="/account/credentials"
                />
              </div>
            </AccountSectionCard>
          </div>
        </div>
      )}
    </>
  );
}

function emptySummary() {
  return {
    impressions: 0,
    previous_impressions: 0,
    profile_views: 0,
    previous_profile_views: 0,
    unique_profile_views: 0,
    previous_unique_profile_views: 0,
    leads: 0,
    previous_leads: 0,
    charges_agorot: 0,
    previous_charges_agorot: 0,
  };
}

function conversionNote(value: number, base: number, suffix: string): string {
  if (!base) return "טרם נצברו נתונים";
  return `${((value / base) * 100).toFixed(1)}% ${suffix}`;
}

function NoProfileState({ email, accountStatus }: { email: string; accountStatus: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-card sm:p-8">
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
          <UserRoundPen className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-bold text-foreground">עדיין אין פרופיל שמקושר לחשבון</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          אפשר ליצור פרופיל מקצועי חדש. פרופיל קיים שנוצר על ידי טיפולינקס יחובר לחשבון רק לאחר השלמת תהליך קבלת הבעלות.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/new-profile" search={{ therapistId: undefined }}>
            יצירת פרופיל חדש
          </Link>
        </Button>
        <div className="mt-6 grid gap-2 rounded-xl bg-muted/60 p-4 text-right text-xs text-muted-foreground sm:grid-cols-2">
          <span>
            חשבון: <span dir="ltr">{email}</span>
          </span>
          <span>סטטוס: {accountStatus}</span>
        </div>
      </div>
    </div>
  );
}

function FunnelStep({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: typeof Search;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-2xl font-bold text-foreground ltr-num">{value}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function QuickStatusRow({
  icon: Icon,
  title,
  description,
  actionLabel,
  to,
}: {
  icon: typeof UserRoundPen;
  title: string;
  description: string;
  actionLabel: string;
  to: "/account/profile" | "/account/credentials";
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        <Link to={to} className="mt-2 inline-block text-xs font-semibold text-brand underline-offset-4 hover:underline">
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case "pending":
      return "ממתין";
    case "active":
      return "פעיל";
    case "claimed":
      return "שויך פרופיל";
    case "suspended":
      return "מושהה";
    default:
      return s;
  }
}
