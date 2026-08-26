import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDateTime } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { listAdminLeads, type AdminLeadRow } from "@/lib/admin-leads.functions";

export const Route = createFileRoute("/admin/leads")({
  head: () => ({
    meta: [
      { title: "פניות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "מעקב אחר פניות שנוצרו במערכת" },
    ],
  }),
  component: LeadsPage,
});

const PERIODS = ["7 ימים אחרונים", "30 ימים אחרונים"];

const WORKFLOW_LABELS: Record<AdminLeadRow["workflowStatus"], string> = {
  new: "חדשה",
  in_progress: "בטיפול",
  handled: "טופלה",
  archived: "בארכיון",
};

function withinPeriod(createdAt: string, period: string): boolean {
  if (period === "all" || period === "כל התקופה") return true;
  const days = period === "7 ימים אחרונים" ? 7 : period === "30 ימים אחרונים" ? 30 : null;
  if (!days) return true;
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function LeadsPage() {
  const listFn = useServerFn(listAdminLeads);
  const leads = useQuery({
    queryKey: ["admin-leads"],
    queryFn: async (): Promise<AdminLeadRow[]> => listFn(),
  });
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [therapist, setTherapist] = useState("all");
  const [selected, setSelected] = useState<AdminLeadRow | null>(null);

  const rows: AdminLeadRow[] = leads.data ?? [];
  const therapists = useMemo<string[]>(
    () =>
      Array.from(new Set(rows.map((row: AdminLeadRow) => row.therapistName))).sort((a, b) => a.localeCompare(b, "he")),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("he");
    return rows.filter((row) => {
      if (term) {
        const haystack = `${row.id} ${row.therapistName} ${row.source}`.toLocaleLowerCase("he");
        if (!haystack.includes(term)) return false;
      }
      if (channel !== "all" && row.channel !== channel) return false;
      if (status !== "all" && row.status !== status) return false;
      if (therapist !== "all" && row.therapistName !== therapist) return false;
      if (!withinPeriod(row.createdAt, period)) return false;
      return true;
    });
  }, [rows, search, channel, status, therapist, period]);

  const columns: AdminColumn<AdminLeadRow>[] = [
    {
      key: "id",
      header: "מזהה",
      render: (row) => (
        <span dir="ltr" className="font-medium">
          {row.id}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "תאריך",
      render: (row) => <span dir="ltr">{formatAdminDateTime(row.createdAt)}</span>,
    },
    { key: "therapistName", header: "מטפל/ת", render: (row) => row.therapistName },
    { key: "channel", header: "ערוץ", render: (row) => row.channel },
    { key: "source", header: "מקור", hideOnNarrow: true, render: (row) => row.source },
    { key: "status", header: "סטטוס", render: (row) => <AdminStatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <AdminPageHeader
        title="פניות"
        subtitle={leads.isLoading ? "טוען פניות…" : `${rows.length.toLocaleString("he-IL")} פניות שנוצרו במערכת`}
        breadcrumb="פניות"
      />

      {leads.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          לא ניתן לטעון את רשימת הפניות. {leads.error instanceof Error ? leads.error.message : ""}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <AdminStatCard label="סה״כ פניות" value={rows.length} />
        <AdminStatCard label="נמסרו" value={rows.filter((lead) => lead.status === "נמסרה").length} />
        <AdminStatCard label="נענו" value={rows.filter((lead) => lead.status === "נענתה").length} />
        <AdminStatCard label="נכשלו" value={rows.filter((lead) => lead.status === "נכשלה").length} />
      </div>

      <AdminFilterBar>
        <AdminSearchField
          id="lead-search"
          label="חיפוש"
          placeholder="מזהה פנייה או שם מטפל/ת"
          value={search}
          onChange={setSearch}
        />
        <AdminSelectFilter
          id="lead-period"
          label="תקופה"
          value={period}
          onChange={setPeriod}
          options={PERIODS}
          allLabel="כל התקופה"
        />
        <AdminSelectFilter
          id="lead-channel"
          label="ערוץ"
          value={channel}
          onChange={setChannel}
          options={["WhatsApp", "טלפון", "אימייל", "אחר"]}
        />
        <AdminSelectFilter
          id="lead-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={["נוצרה", "נמסרה", "נענתה", "נכשלה"]}
        />
        <AdminSelectFilter
          id="lead-therapist"
          label="מטפל/ת"
          value={therapist}
          onChange={setTherapist}
          options={therapists}
        />
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelected(row)}
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span dir="ltr" className="font-semibold text-foreground">
                {row.id}
              </span>
              <AdminStatusBadge status={row.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.therapistName} · {row.channel}
            </p>
            <p className="text-[11px] text-muted-foreground" dir="ltr">
              {formatAdminDateTime(row.createdAt)}
            </p>
          </div>
        )}
        emptyTitle={leads.isLoading ? "טוען…" : "אין פניות מתאימות"}
        emptyDescription="נסו לשנות את מסנני החיפוש."
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected ? `פנייה ${selected.id}` : ""}
        description="נתוני הפנייה כפי שנשמרו במערכת."
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרטי פנייה">
              <AdminDetailRow label="מזהה" value={<span dir="ltr">{selected.id}</span>} />
              <AdminDetailRow
                label="מועד יצירה"
                value={<span dir="ltr">{formatAdminDateTime(selected.createdAt)}</span>}
              />
              <AdminDetailRow label="מטפל/ת" value={selected.therapistName} />
              <AdminDetailRow label="ערוץ פנייה" value={selected.channel} />
              <AdminDetailRow label="מקור" value={selected.source} />
              <AdminDetailRow label="סטטוס מסירה" value={<AdminStatusBadge status={selected.status} />} />
            </AdminDetailSection>

            <AdminDetailSection title="מצב טיפול">
              <AdminDetailRow
                label="מצב אצל המטפל/ת"
                value={<AdminStatusBadge status={WORKFLOW_LABELS[selected.workflowStatus]} />}
              />
              <AdminDetailRow
                label="עודכן לאחרונה"
                value={
                  selected.workflowUpdatedAt ? (
                    <span dir="ltr">{formatAdminDateTime(selected.workflowUpdatedAt)}</span>
                  ) : (
                    "טרם עודכן"
                  )
                }
              />
            </AdminDetailSection>

            <AdminDetailSection title="מטא-דאטה טכנית">
              <AdminDetailRow label="מזהה אירוע CTA" value={<span dir="ltr">{selected.ctaEventId ?? "—"}</span>} />
              <AdminDetailRow label="סטטוס ספק" value={<span dir="ltr">{selected.deliveryStatus}</span>} />
              <AdminDetailRow
                label="מזהה הודעת ספק"
                value={<span dir="ltr">{selected.providerMessageId ?? "—"}</span>}
              />
            </AdminDetailSection>
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
