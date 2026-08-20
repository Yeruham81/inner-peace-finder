import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AdminDataTable, AdminPagination, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { MOCK_LEADS, type MockLead } from "@/components/admin/admin-mock-data";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";

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

const PAGE_SIZE = 4;
const PERIODS = ["7 ימים אחרונים", "30 ימים אחרונים", "כל התקופה"];

function LeadsPage() {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [therapist, setTherapist] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MockLead | null>(null);

  const therapists = useMemo(() => Array.from(new Set(MOCK_LEADS.map((row) => row.therapistName))), []);

  const filtered = useMemo(() => {
    const term = search.trim();
    return MOCK_LEADS.filter((row) => {
      if (term && !row.id.toLowerCase().includes(term.toLowerCase()) && !row.therapistName.includes(term)) return false;
      if (channel !== "all" && row.channel !== channel) return false;
      if (status !== "all" && row.status !== status) return false;
      if (therapist !== "all" && row.therapistName !== therapist) return false;
      if (period === "7 ימים אחרונים" && row.createdAt < "2026-08-12") return false;
      if (period === "30 ימים אחרונים" && row.createdAt < "2026-07-20") return false;
      return true;
    });
  }, [search, channel, status, therapist, period]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const columns: AdminColumn<MockLead>[] = [
    { key: "id", header: "מזהה", render: (row) => <span dir="ltr" className="font-medium">{row.id}</span> },
    { key: "createdAt", header: "תאריך", render: (row) => <span dir="ltr">{row.createdAt}</span> },
    { key: "therapistName", header: "מטפל/ת", render: (row) => row.therapistName },
    { key: "channel", header: "ערוץ", render: (row) => row.channel },
    { key: "source", header: "מקור", hideOnNarrow: true, render: (row) => row.source },
    { key: "status", header: "סטטוס", render: (row) => <AdminStatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <AdminPageHeader title="פניות" subtitle="מעקב אחר פניות (נתוני הדגמה בלבד)" breadcrumb="פניות" />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <AdminStatCard label="סה״כ פניות" value={MOCK_LEADS.length} hint="נתוני הדגמה" />
        <AdminStatCard label="נמסרו" value={MOCK_LEADS.filter((l) => l.status === "נמסרה").length} hint="נתוני הדגמה" />
        <AdminStatCard label="נענו" value={MOCK_LEADS.filter((l) => l.status === "נענתה").length} hint="נתוני הדגמה" />
        <AdminStatCard label="נכשלו" value={MOCK_LEADS.filter((l) => l.status === "נכשלה").length} hint="נתוני הדגמה" />
      </div>

      <AdminFilterBar>
        <AdminSearchField
          id="lead-search"
          label="חיפוש"
          placeholder="מזהה פנייה או שם מטפל/ת"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <AdminSelectFilter id="lead-period" label="תקופה" value={period} onChange={setPeriod} options={PERIODS} />
        <AdminSelectFilter
          id="lead-channel"
          label="ערוץ"
          value={channel}
          onChange={setChannel}
          options={["WhatsApp", "טלפון", "אימייל"]}
        />
        <AdminSelectFilter
          id="lead-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={["נוצרה", "נמסרה", "נענתה", "נכשלה"]}
        />
        <AdminSelectFilter id="lead-therapist" label="מטפל/ת" value={therapist} onChange={setTherapist} options={therapists} />
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={paged}
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
              {row.createdAt}
            </p>
          </div>
        )}
        emptyTitle="אין פניות מתאימות"
        footer={<AdminPagination page={currentPage} pageCount={pageCount} total={filtered.length} onPageChange={setPage} />}
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected ? `פנייה ${selected.id}` : ""}
        description="נתוני הדגמה — אינם מקושרים לפניות אמיתיות."
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרטי פנייה">
              <AdminDetailRow label="מזהה" value={<span dir="ltr">{selected.id}</span>} />
              <AdminDetailRow label="מועד יצירה" value={<span dir="ltr">{selected.createdAt}</span>} />
              <AdminDetailRow label="מטפל/ת" value={selected.therapistName} />
              <AdminDetailRow label="ערוץ פנייה" value={selected.channel} />
              <AdminDetailRow label="מקור" value={selected.source} />
              <AdminDetailRow label="סטטוס" value={<AdminStatusBadge status={selected.status} />} />
            </AdminDetailSection>

            <AdminDetailSection title="היסטוריית סטטוס">
              {selected.history.map((entry) => (
                <AdminDetailRow key={entry.label} label={entry.label} value={<span dir="ltr">{entry.at}</span>} />
              ))}
            </AdminDetailSection>

            <AdminDetailSection title="מטא-דאטה טכנית">
              <AdminDetailRow label="מזהה בקשה" value={<span dir="ltr">req_mock_00{selected.id.slice(-2)}</span>} />
              <AdminDetailRow label="ערוץ מסירה" value="ספק חיצוני יוגדר בשלב הבא" />
              <AdminDetailRow label="ניסיונות מסירה" value="1" />
            </AdminDetailSection>
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
