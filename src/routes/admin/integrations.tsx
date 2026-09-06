import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BrainCircuit,
  CreditCard,
  Database,
  Landmark,
  Mail,
  MapPinned,
  MessageCircle,
  Phone,
  RefreshCw,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAdminIntegrationStatuses,
  type AdminIntegrationKey,
  type AdminIntegrationStatus,
  type IntegrationHealth,
} from "@/lib/admin-integrations.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({
    meta: [
      { title: "אינטגרציות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "מצב חיבור ובריאות ספקים חיצוניים" },
    ],
  }),
  component: IntegrationsPage,
});

const ICONS: Record<AdminIntegrationKey, LucideIcon> = {
  supabase: Database,
  openai: BrainCircuit,
  twilio: Phone,
  "meta-whatsapp": MessageCircle,
  brevo: Mail,
  zoho: Landmark,
  "data-gov": MapPinned,
  "google-analytics": BarChart3,
  payment: CreditCard,
};

const STATUS_LABEL: Record<IntegrationHealth, string> = {
  healthy: "תקין",
  warning: "אזהרה",
  error: "שגיאה",
  planned: "מתוכנן",
  unchecked: "לא נבדק",
};

const CHECK_DOT: Record<IntegrationHealth, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  planned: "bg-muted-foreground/40",
  unchecked: "bg-muted-foreground/40",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function IntegrationsPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(getAdminIntegrationStatuses);
  const integrations = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: () => listFn({ data: { force: false } }),
    staleTime: 60_000,
  });
  const refresh = useMutation({
    mutationFn: () => listFn({ data: { force: true } }),
    onSuccess: (data) => queryClient.setQueryData(["admin-integrations"], data),
  });

  const rows = integrations.data ?? [];
  const isRefreshing = integrations.isFetching || refresh.isPending;

  return (
    <div>
      <AdminPageHeader
        title="אינטגרציות"
        subtitle="בדיקות בריאות אמיתיות לספקים ולשירותים החיצוניים של טיפולינקס"
        breadcrumb="אינטגרציות"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div>
          <p className="text-sm font-medium text-foreground">מצב מערכת חיצונית</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            הבדיקות אינן יוצרות שיחות או הודעות ואינן שולחות בקשות OpenAI בתשלום.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={isRefreshing}>
          <RefreshCw className={cn("ms-1 h-4 w-4", isRefreshing && "animate-spin")} aria-hidden="true" />
          רענון בדיקות
        </Button>
      </div>

      {integrations.isError || refresh.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          לא ניתן לטעון את סטטוס האינטגרציות.
        </div>
      ) : null}

      {integrations.isLoading ? (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          בודק את החיבורים החיצוניים…
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <IntegrationCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationCard({ item }: { item: AdminIntegrationStatus }) {
  const Icon = ICONS[item.key];

  return (
    <Card className="shadow-card">
      <CardContent className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-soft text-foreground">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{item.provider}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">נבדק: {formatDateTime(item.checkedAt)}</p>
            </div>
          </div>
          <AdminStatusBadge status={STATUS_LABEL[item.state]} />
        </div>

        <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.description}</p>
        <p className="mt-2 text-xs font-medium leading-5 text-foreground">{item.summary}</p>

        <div className="mt-3 rounded-md border border-border">
          {item.checks.map((check, index) => (
            <div
              key={`${check.label}-${index}`}
              className={cn("flex items-start gap-2 px-3 py-2 text-xs", index > 0 && "border-t border-border/70")}
            >
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", CHECK_DOT[check.state])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">{check.label}</span>
                  <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[check.state]}</span>
                </div>
                {check.detail ? (
                  <p className="mt-0.5 break-words leading-5 text-muted-foreground">{check.detail}</p>
                ) : null}
                {check.at ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(check.at)}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-3">
          <p className="text-[11px] font-medium text-foreground">שימושים</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.uses.join(" · ")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
