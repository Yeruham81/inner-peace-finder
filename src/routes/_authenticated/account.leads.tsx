import { createFileRoute } from "@tanstack/react-router";
import { Filter, Mail, MessageCircle, Phone, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { ACCOUNT_MOCK_LEADS } from "@/components/account/account-mock-data";
import { ContactPreferencesPanel } from "@/components/account/contact-preferences-panel";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/account/leads")({
  head: () => ({
    meta: [{ title: "פניות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountLeadsPage,
});

function AccountLeadsPage() {
  const { user } = Route.useRouteContext();
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ACCOUNT_MOCK_LEADS.filter((lead) => {
      const matchesChannel = channel === "all" || lead.channel === channel;
      const matchesQuery = !q || `${lead.id} ${lead.channel} ${lead.status} ${lead.date}`.toLowerCase().includes(q);
      return matchesChannel && matchesQuery;
    });
  }, [channel, query]);

  return (
    <>
      <AccountPageHeader
        eyebrow="ניהול פניות"
        title="פניות"
        description="הגדירו כיצד לקבל פניות וצפו בפניות שהתקבלו דרך טיפולינקס, בסטטוס המסירה ובחיוב."
        action={
          <Badge variant="secondary" className="bg-brand-soft text-brand hover:bg-brand-soft">
            נתוני הדגמה
          </Badge>
        }
      />

      <ContactPreferencesPanel defaultEmail={user.email ?? ""} />

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
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                <SelectItem value="טלפון">טלפון</SelectItem>
                <SelectItem value="אימייל">אימייל</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
                  <td className="px-4 py-4 font-medium text-foreground ltr-num">{lead.id}</td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {lead.date} · {lead.time}
                  </td>
                  <td className="px-4 py-4">
                    <ChannelLabel channel={lead.channel} />
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-4 font-semibold text-foreground ltr-num">
                    {lead.charge ? `₪${lead.charge}` : "—"}
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
                  <p className="text-sm font-semibold text-foreground ltr-num">{lead.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lead.date} · {lead.time}
                  </p>
                </div>
                <span className="text-sm font-semibold text-foreground ltr-num">
                  {lead.charge ? `₪${lead.charge}` : "—"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ChannelLabel channel={lead.channel} />
                <StatusBadge status={lead.status} />
              </div>
            </article>
          ))}
        </div>

        {leads.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">לא נמצאו פניות התואמות לסינון.</div>
        )}
      </div>
    </>
  );
}

function ChannelLabel({ channel }: { channel: "WhatsApp" | "טלפון" | "אימייל" }) {
  const Icon = channel === "WhatsApp" ? MessageCircle : channel === "טלפון" ? Phone : Mail;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <Icon className="h-4 w-4 text-brand" />
      {channel}
    </span>
  );
}

function StatusBadge({ status }: { status: "נמסרה" | "שיחה נענתה" | "ממתינה" }) {
  const cls = status === "ממתינה" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{status}</span>;
}
