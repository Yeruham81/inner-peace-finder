import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { AccountStatCard } from "@/components/account/account-stat-card";
import {
  ACCOUNT_MOCK_CHANNELS,
  ACCOUNT_MOCK_DAILY,
  ACCOUNT_MOCK_LEADS,
  ACCOUNT_MOCK_SUMMARY,
} from "@/components/account/account-mock-data";
import { Button } from "@/components/ui/button";
import { ensureTherapistAccount } from "@/lib/therapist-accounts.functions";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({
    meta: [{ title: "סקירה | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountOverviewPage,
});

function AccountOverviewPage() {
  const { user } = Route.useRouteContext();
  const ensureFn = useServerFn(ensureTherapistAccount);

  // Use the idempotent ensure call as the account query itself. This avoids a
  // first-visit race where a separate read can finish before account creation.
  const accountQuery = useQuery({
    queryKey: ["therapist-account", user.id],
    queryFn: () => ensureFn(),
  });
  const { data: account, isLoading, isError } = accountQuery;

  return (
    <>
      <AccountPageHeader
        eyebrow="מרכז הניהול"
        title="סקירה"
        description="כל מה שחשוב לדעת על החשיפה, הצפיות והפניות לפרופיל במקום אחד. בשלב זה נתוני הביצועים המוצגים הם נתוני הדגמה בלבד."
        action={
          <span className="inline-flex items-center rounded-full border border-brand/20 bg-brand-soft/60 px-3 py-1.5 text-xs font-semibold text-brand">
            נתוני הדגמה
          </span>
        }
      />

      {!isLoading && !isError && account && !account.owned_therapist_id && (
        <NoProfileState email={user.email ?? ""} accountStatus={statusLabel(account.account_status)} />
      )}

      {!isLoading && !isError && account?.owned_therapist_id && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccountStatCard
              label="הופעות בתוצאות"
              value={ACCOUNT_MOCK_SUMMARY.impressions.toLocaleString("he-IL")}
              detail="לעומת 30 הימים הקודמים"
              change={18}
              icon={Search}
            />
            <AccountStatCard
              label="צפיות בפרופיל"
              value={ACCOUNT_MOCK_SUMMARY.profileViews.toLocaleString("he-IL")}
              detail={`${ACCOUNT_MOCK_SUMMARY.uniqueViews} מבקרים ייחודיים`}
              change={12}
              icon={Eye}
            />
            <AccountStatCard
              label="פניות"
              value={ACCOUNT_MOCK_SUMMARY.leads.toLocaleString("he-IL")}
              detail="מכל אמצעי התקשורת"
              change={8}
              icon={MessageSquareText}
            />
            <AccountStatCard
              label="חיובים"
              value={`₪${ACCOUNT_MOCK_SUMMARY.charges.toLocaleString("he-IL")}`}
              detail="בתקופת הדוגמה"
              change={-4}
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
                value={ACCOUNT_MOCK_SUMMARY.impressions.toLocaleString("he-IL")}
                label="הופעות בתוצאות"
                note="100%"
              />
              <ArrowLeft className="mx-auto hidden h-5 w-5 text-muted-foreground md:block" />
              <FunnelStep
                icon={MousePointerClick}
                value={ACCOUNT_MOCK_SUMMARY.profileViews.toLocaleString("he-IL")}
                label="צפיות בפרופיל"
                note={`${((ACCOUNT_MOCK_SUMMARY.profileViews / ACCOUNT_MOCK_SUMMARY.impressions) * 100).toFixed(1)}% מההופעות`}
              />
              <ArrowLeft className="mx-auto hidden h-5 w-5 text-muted-foreground md:block" />
              <FunnelStep
                icon={MessageSquareText}
                value={ACCOUNT_MOCK_SUMMARY.leads.toLocaleString("he-IL")}
                label="פניות"
                note={`${((ACCOUNT_MOCK_SUMMARY.leads / ACCOUNT_MOCK_SUMMARY.profileViews) * 100).toFixed(1)}% מהצפיות`}
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
                  <AreaChart data={ACCOUNT_MOCK_DAILY} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="accountImpressions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, borderColor: "var(--border)", direction: "rtl" }}
                      formatter={(value, name) => [value, name === "impressions" ? "הופעות" : "צפיות"]}
                      labelFormatter={(label) => `יום ${label}`}
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

            <AccountSectionCard title="פניות לפי ערוץ" description="חלוקת הפניות בתקופת הדוגמה.">
              <div className="space-y-5">
                {ACCOUNT_MOCK_CHANNELS.map((item) => (
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
              <div className="divide-y divide-border/70">
                {ACCOUNT_MOCK_LEADS.slice(0, 4).map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        פנייה ב{lead.channel === "טלפון" ? "" : "-"}
                        {lead.channel}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {lead.date} · {lead.time} · {lead.status}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground ltr-num">
                      {lead.charge ? `₪${lead.charge}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
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
                  title="אימות והסמכות"
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
          <Link to="/new-profile" search={{}}>
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
