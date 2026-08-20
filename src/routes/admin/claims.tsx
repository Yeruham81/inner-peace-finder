import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { MOCK_CLAIMS, type MockClaim } from "@/components/admin/admin-mock-data";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/claims")({
  head: () => ({
    meta: [
      { title: "בקשות שיוך | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "בדיקת בקשות שיוך פרופיל" },
    ],
  }),
  component: ClaimsPage,
});

const PERIODS = ["7 ימים אחרונים", "30 ימים אחרונים", "כל התקופה"];

function ClaimsPage() {
  const [claims, setClaims] = useState<MockClaim[]>(MOCK_CLAIMS);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim();
    return claims.filter((row) => {
      if (term && !row.applicantName.includes(term) && !row.requestedProfile.includes(term) && !row.email.includes(term))
        return false;
      if (status !== "all" && row.status !== status) return false;
      if (period === "7 ימים אחרונים" && row.requestedAt < "2026-08-12") return false;
      if (period === "30 ימים אחרונים" && row.requestedAt < "2026-07-20") return false;
      return true;
    });
  }, [claims, search, status, period]);

  const selected = claims.find((row) => row.id === selectedId) ?? null;

  function close() {
    setSelectedId(null);
    setRejecting(false);
    setReason("");
  }

  const columns: AdminColumn<MockClaim>[] = [
    { key: "applicantName", header: "שם המבקש/ת", render: (row) => <span className="font-medium">{row.applicantName}</span> },
    { key: "requestedProfile", header: "פרופיל מבוקש", render: (row) => row.requestedProfile },
    { key: "email", header: "אימייל", hideOnNarrow: true, render: (row) => <span dir="ltr">{row.email}</span> },
    { key: "phone", header: "טלפון", hideOnNarrow: true, render: (row) => <span dir="ltr">{row.phone}</span> },
    { key: "requestedAt", header: "תאריך בקשה", render: (row) => row.requestedAt },
    { key: "status", header: "סטטוס", render: (row) => <AdminStatusBadge status={row.status} /> },
  ];

  return (
    <div>
      <AdminPageHeader
        title="בקשות שיוך"
        subtitle="בדיקת בקשות שיוך פרופיל (נתוני הדגמה, ללא כתיבה לשרת)"
        breadcrumb="בקשות שיוך"
      />

      <AdminFilterBar>
        <AdminSearchField
          id="claim-search"
          label="חיפוש"
          placeholder="שם, פרופיל או אימייל"
          value={search}
          onChange={setSearch}
        />
        <AdminSelectFilter
          id="claim-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={["ממתין", "אושר", "נדחה"]}
        />
        <AdminSelectFilter id="claim-period" label="תקופה" value={period} onChange={setPeriod} options={PERIODS} />
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.applicantName}</span>
              <AdminStatusBadge status={row.status} />
            </div>
            <p className="text-xs text-muted-foreground">{row.requestedProfile}</p>
            <p className="text-[11px] text-muted-foreground" dir="ltr">
              {row.email} · {row.requestedAt}
            </p>
          </div>
        )}
        emptyTitle="אין בקשות מתאימות"
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={selected ? `בקשת שיוך — ${selected.applicantName}` : ""}
        description="מסך הדגמה. אישור או דחייה מעדכנים מצב מקומי בלבד."
        footer={
          selected && selected.status === "ממתין" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setClaims((rows) => rows.map((row) => (row.id === selected.id ? { ...row, status: "אושר" } : row)));
                  close();
                }}
              >
                אישור
              </Button>
              {rejecting ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!reason.trim()}
                  onClick={() => {
                    setClaims((rows) =>
                      rows.map((row) =>
                        row.id === selected.id ? { ...row, status: "נדחה", rejectionReason: reason.trim() } : row,
                      ),
                    );
                    close();
                  }}
                >
                  אישור דחייה
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                  דחייה
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרטי המבקש/ת">
              <AdminDetailRow label="שם" value={selected.applicantName} />
              <AdminDetailRow label="אימייל" value={<span dir="ltr">{selected.email}</span>} />
              <AdminDetailRow label="טלפון" value={<span dir="ltr">{selected.phone}</span>} />
            </AdminDetailSection>

            <AdminDetailSection title="הבקשה">
              <AdminDetailRow label="פרופיל מבוקש" value={selected.requestedProfile} />
              <AdminDetailRow label="תאריך הבקשה" value={selected.requestedAt} />
              <AdminDetailRow label="סטטוס" value={<AdminStatusBadge status={selected.status} />} />
              {selected.rejectionReason ? <AdminDetailRow label="סיבת הדחייה" value={selected.rejectionReason} /> : null}
            </AdminDetailSection>

            <AdminDetailSection title="מידע תומך">
              <p className="text-xs text-muted-foreground">{selected.supportingInfo}</p>
            </AdminDetailSection>

            {rejecting ? (
              <AdminDetailSection title="דחיית הבקשה">
                <Label htmlFor="claim-reason" className="text-xs text-muted-foreground">
                  סיבת הדחייה
                </Label>
                <Textarea id="claim-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
