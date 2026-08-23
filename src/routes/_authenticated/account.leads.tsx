import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Filter, Inbox, Mail, MessageCircle, Phone, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { ACCOUNT_MOCK_LEADS } from "@/components/account/account-mock-data";
import { ContactPreferencesPanel } from "@/components/account/contact-preferences-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  accountChannelLabel,
  accountLeadStatusLabel,
  formatAccountActivityDate,
  formatAgorot,
  shortActivityId,
} from "@/lib/account-activity";
import {
  getMyAccountLeads,
  type AccountActivityChannel,
  type AccountLeadActivity,
} from "@/lib/account-activity.functions";

export const Route = createFileRoute("/_authenticated/account/leads")({
  head: () => ({
    meta: [{ title: "פניות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountLeadsPage,
});

type LeadDisplayRow = {
  id: string;
  displayId: string;
  date: string;
  time: string;
  channel: AccountActivityChannel;
  status: string;
  statusLabel: string;
  chargeAgorot: number;
};

function realLeadRow(lead: AccountLeadActivity): LeadDisplayRow {
  const timestamp = formatAccountActivityDate(lead.created_at);
  return {
    id: lead.id,
    displayId: shortActivityId(lead.id, "L"),
    date: timestamp.date,
    time: timestamp.time,
    channel: lead.channel,
    status: lead.delivery_status,
    statusLabel: accountLeadStatusLabel(lead.delivery_status, lead.channel),
    chargeAgorot: lead.charge_agorot,
  };
}

function exampleLeadRows(): LeadDisplayRow[] {
  return ACCOUNT_MOCK_LEADS.map((lead) => {
    const channel: AccountActivityChannel =
      lead.channel === "WhatsApp" ? "whatsapp" : lead.channel === "טלפון" ? "phone" : "email";
    return {
      id: lead.id,
      displayId: lead.id,
      date: lead.date,
      time: lead.time,
      channel,
      status: lead.status === "ממתינה" ? "pending" : channel === "phone" ? "connected" : "sent",
      statusLabel: lead.status,
      chargeAgorot: lead.charge * 100,
    };
  });
}

function AccountLeadsPage() {
  const { user } = Route.useRouteContext();
  const getLeadsFn = useServerFn(getMyAccountLeads);
  const leadsQuery = useQuery({ queryKey: ["my-account-leads"], queryFn: () => getLeadsFn() });
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [showExample, setShowExample] = useState(false);

  const realRows = useMemo(() => (leadsQuery.data ?? []).map(realLeadRow), [leadsQuery.data]);
  const sourceRows = showExample ? exampleLeadRows() : realRows;
  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sourceRows.filter((lead) => {
      const matchesChannel = channel === "all" || lead.channel === channel;
      const matchesQuery =
        !q ||
        `${lead.id} ${lead.displayId} ${accountChannelLabel(lead.channel)} ${lead.statusLabel} ${lead.date}`
          .toLowerCase()
          .includes(q);
      return matchesChannel && matchesQuery;
    });
  }, [channel, query, sourceRows]);

  return (
    <>
      <AccountPageHeader
        eyebrow="ניהול פניות"
        title="פניות"
        description="הגדירו כיצד לקבל פניות וצפו בפניות שהתקבלו דרך טיפולינקס, בסטטוס המסירה ובחיוב."
        action={
          showExample ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-100">
              תצוגת דוגמה
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-brand-soft text-brand hover:bg-brand-soft">
              {realRows.length.toLocaleString("he-IL")} פניות
            </Badge>
          )
        }
      />

      <ContactPreferencesPanel defaultEmail={user.email ?? ""} />

      {showExample && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span>הנתונים הבאים נועדו להמחיש כיצד המסך ייראה לאחר קבלת פניות ואינם נשמרים בחשבון.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowExample(false)}>
            חזרה לנתונים שלי
          </Button>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface-elevated shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לפי מזהה, תאריך או סטטוס"
              className="pr-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-[170px] bg-white">
                <SelectValue placeholder="כל הערוצים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הערוצים</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="phone">טלפון</SelectItem>
                <SelectItem value="email">אימייל</SelectItem>
                <SelectItem value="other">ערוץ אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {leadsQuery.isLoading && !showExample ? (
          <div className="p-8 text-center text-sm text-muted-foreground">טוען את הפניות…</div>
        ) : leadsQuery.isError && !showExample ? (
          <div className="p-8 text-center">
            <p className="text-sm text-destructive">לא הצלחנו לטעון את הפניות.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void leadsQuery.refetch()}
            >
              ניסיון חוזר
            </Button>
          </div>
        ) : realRows.length === 0 && !showExample ? (
          <EmptyLeadsState onShowExample={() => setShowExample(true)} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">מזהה</th>
                    <th className="px-4 py-3 text-right font-medium">תאריך ושעה</th>
                    <th className="px-4 py-3 text-right font-medium">ערוץ</th>
                    <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                    <th className="px-4 py-3 text-right font-medium">חיוב</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-4 font-medium text-foreground ltr-num">{lead.displayId}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {lead.date} · {lead.time}
                      </td>
                      <td className="px-4 py-4">
                        <ChannelLabel channel={lead.channel} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={lead.status} label={lead.statusLabel} />
                      </td>
                      <td className="px-4 py-4 font-semibold text-foreground ltr-num">
                        {lead.chargeAgorot ? formatAgorot(lead.chargeAgorot) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border/70 md:hidden">
              {leads.map((lead) => (
                <article key={lead.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground ltr-num">{lead.displayId}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lead.date} · {lead.time}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground ltr-num">
                      {lead.chargeAgorot ? formatAgorot(lead.chargeAgorot) : "—"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ChannelLabel channel={lead.channel} />
                    <StatusBadge status={lead.status} label={lead.statusLabel} />
                  </div>
                </article>
              ))}
            </div>

            {leads.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">לא נמצאו פניות התואמות לסינון.</div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function EmptyLeadsState({ onShowExample }: { onShowExample: () => void }) {
  return (
    <div className="p-8 text-center sm:p-12">
      <Inbox className="mx-auto h-9 w-9 text-brand" />
      <h2 className="mt-3 text-base font-semibold text-foreground">עדיין לא התקבלו פניות</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        פניות חדשות יופיעו כאן עם מועד הפנייה, ערוץ הקשר, סטטוס השליחה והחיוב שנרשם.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onShowExample}>
        הצגת דוגמה
      </Button>
    </div>
  );
}

function ChannelLabel({ channel }: { channel: AccountActivityChannel }) {
  const Icon = channel === "whatsapp" ? MessageCircle : channel === "phone" ? Phone : Mail;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <Icon className="h-4 w-4 text-brand" />
      {accountChannelLabel(channel)}
    </span>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls =
    status === "pending" || status === "awaiting_consent"
      ? "bg-amber-100 text-amber-900"
      : status === "failed" || status === "cancelled_after_opt_out" || status === "expired_before_consent"
        ? "bg-red-100 text-red-900"
        : "bg-emerald-100 text-emerald-900";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}
