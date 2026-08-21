import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDate } from "@/components/admin/admin-formatters";
import { MOCK_CREDENTIAL_REQUESTS, type MockCredentialRequest } from "@/components/admin/admin-mock-data";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/credentials")({
  head: () => ({
    meta: [
      { title: "אימות הסמכות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "בדיקת בקשות אימות הסמכות של מטפלים" },
    ],
  }),
  component: CredentialsPage,
});

function CredentialsPage() {
  const [requests, setRequests] = useState<MockCredentialRequest[]>(MOCK_CREDENTIAL_REQUESTS);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ממתין לבדיקה");
  const [profession, setProfession] = useState("all");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const professions = useMemo(() => Array.from(new Set(MOCK_CREDENTIAL_REQUESTS.map((row) => row.profession))), []);

  const filtered = useMemo(() => {
    const term = search.trim();
    const rows = requests.filter((row) => {
      if (
        term &&
        !row.therapistName.includes(term) &&
        !row.credentialType.includes(term) &&
        !row.licenseNumber.includes(term)
      )
        return false;
      if (status !== "all" && row.status !== status) return false;
      if (profession !== "all" && row.profession !== profession) return false;
      return true;
    });
    return [...rows].sort((a, b) =>
      sortDirection === "asc" ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt),
    );
  }, [requests, search, status, profession, sortDirection]);

  const selected = requests.find((row) => row.id === selectedId) ?? null;
  const pendingCount = requests.filter((row) => row.status === "ממתין לבדיקה").length;
  const approvedCount = requests.filter((row) => row.status === "מאומת").length;
  const rejectedCount = requests.filter((row) => row.status === "נדחה").length;

  function closeDrawer() {
    setSelectedId(null);
    setRejecting(false);
    setRejectionReason("");
  }

  function approveMock(id: string) {
    setRequests((rows) =>
      rows.map((row) => (row.id === id ? { ...row, status: "מאומת", rejectionReason: undefined } : row)),
    );
    closeDrawer();
  }

  function rejectMock(id: string) {
    setRequests((rows) =>
      rows.map((row) => (row.id === id ? { ...row, status: "נדחה", rejectionReason: rejectionReason.trim() } : row)),
    );
    closeDrawer();
  }

  const columns: AdminColumn<MockCredentialRequest>[] = [
    {
      key: "therapistName",
      header: "שם המטפל/ת",
      render: (row) => <span className="font-medium">{row.therapistName}</span>,
    },
    { key: "credentialType", header: "סוג ההסמכה", render: (row) => row.credentialType },
    { key: "profession", header: "מקצוע", hideOnNarrow: true, render: (row) => row.profession },
    { key: "authority", header: "גוף מעניק", hideOnNarrow: true, render: (row) => row.authority },
    { key: "licenseNumber", header: "מספר רישיון", render: (row) => <span dir="ltr">{row.licenseNumber}</span> },
    {
      key: "submittedAt",
      header: "תאריך הגשה",
      sortable: true,
      render: (row) => <span dir="ltr">{formatAdminDate(row.submittedAt)}</span>,
    },
    { key: "status", header: "סטטוס", render: (row) => <AdminStatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "פעולות",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(row.id);
          }}
        >
          בדיקה
        </Button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="אימות הסמכות"
        subtitle="בדיקת בקשות אימות הסמכות (נתוני הדגמה, ללא כתיבה לשרת)"
        breadcrumb="אימות הסמכות"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <AdminStatCard label="ממתינות לבדיקה" value={pendingCount} hint="נתוני הדגמה" />
        <AdminStatCard label="אושרו" value={approvedCount} hint="נתוני הדגמה" />
        <AdminStatCard label="נדחו" value={rejectedCount} hint="נתוני הדגמה" />
      </div>

      <AdminFilterBar>
        <AdminSearchField
          id="credential-search"
          label="חיפוש"
          placeholder="שם, סוג הסמכה או מספר רישיון"
          value={search}
          onChange={setSearch}
        />
        <AdminSelectFilter
          id="credential-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={["ממתין לבדיקה", "מאומת", "נדחה"]}
        />
        <AdminSelectFilter
          id="credential-profession"
          label="מקצוע"
          value={profession}
          onChange={setProfession}
          options={professions}
        />
        <div className="pb-0.5">
          <Button variant="outline" size="sm" onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}>
            תאריך הגשה {sortDirection === "asc" ? "↑" : "↓"}
          </Button>
        </div>
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        sortKey="submittedAt"
        sortDirection={sortDirection}
        onSortChange={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.therapistName}</span>
              <AdminStatusBadge status={row.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.credentialType} · {row.profession}
            </p>
            <div className="flex items-end justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {row.authority} · הוגש <span dir="ltr">{formatAdminDate(row.submittedAt)}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(row.id);
                }}
              >
                בדיקה
              </Button>
            </div>
          </div>
        )}
        emptyTitle="אין בקשות מתאימות"
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        title={selected ? `בדיקת הסמכה — ${selected.therapistName}` : ""}
        description="מסך הדגמה. אישור או דחייה מעדכנים מצב מקומי בלבד."
        footer={
          selected && selected.status === "ממתין לבדיקה" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => approveMock(selected.id)}>
                אישור
              </Button>
              {rejecting ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => rejectMock(selected.id)}
                  disabled={!rejectionReason.trim()}
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
            <AdminDetailSection title="פרטי הבקשה">
              <AdminDetailRow label="שם המטפל/ת" value={selected.therapistName} />
              <AdminDetailRow label="סוג ההסמכה" value={selected.credentialType} />
              <AdminDetailRow label="מקצוע" value={selected.profession} />
              <AdminDetailRow label="גוף מעניק" value={selected.authority} />
              <AdminDetailRow label="מספר רישיון" value={<span dir="ltr">{selected.licenseNumber}</span>} />
              <AdminDetailRow
                label="תאריך הגשה"
                value={<span dir="ltr">{formatAdminDate(selected.submittedAt)}</span>}
              />
              <AdminDetailRow label="סטטוס" value={<AdminStatusBadge status={selected.status} />} />
              {selected.rejectionReason ? (
                <AdminDetailRow label="סיבת הדחייה" value={selected.rejectionReason} />
              ) : null}
            </AdminDetailSection>

            <AdminDetailSection title="מסמך שהועלה">
              <div className="flex items-center gap-3 rounded-md bg-secondary/60 p-4">
                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground" dir="ltr">
                    {selected.documentName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">תצוגה מקדימה תתאפשר בשלב הבא (הדגמה בלבד).</p>
                </div>
              </div>
            </AdminDetailSection>

            {rejecting ? (
              <AdminDetailSection title="דחיית הבקשה">
                <Label htmlFor="rejection-reason" className="text-xs text-muted-foreground">
                  סיבת הדחייה
                </Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  rows={3}
                  placeholder="פירוט הסיבה לדחייה"
                />
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
