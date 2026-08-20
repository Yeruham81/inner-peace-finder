import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AdminDataTable, AdminPagination, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { MOCK_THERAPISTS, type MockTherapist } from "@/components/admin/admin-mock-data";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/therapists")({
  head: () => ({
    meta: [
      { title: "מטפלים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול וצפייה בפרופילי המטפלים במערכת" },
    ],
  }),
  component: TherapistsPage,
});

const PAGE_SIZE = 5;

function TherapistsPage() {
  const [search, setSearch] = useState("");
  const [profileStatus, setProfileStatus] = useState("all");
  const [accountStatus, setAccountStatus] = useState("all");
  const [verification, setVerification] = useState("all");
  const [sortKey, setSortKey] = useState("joinedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MockTherapist | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim();
    const rows = MOCK_THERAPISTS.filter((row) => {
      if (term && !row.name.includes(term) && !row.title.includes(term)) return false;
      if (profileStatus !== "all" && row.profileStatus !== profileStatus) return false;
      if (accountStatus !== "all" && row.accountStatus !== accountStatus) return false;
      if (verification !== "all" && row.verificationStatus !== verification) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      const left = sortKey === "name" ? a.name : sortKey === "lastActiveAt" ? a.lastActiveAt : a.joinedAt;
      const right = sortKey === "name" ? b.name : sortKey === "lastActiveAt" ? b.lastActiveAt : b.joinedAt;
      const compare = left.localeCompare(right, "he");
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [search, profileStatus, accountStatus, verification, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  const columns: AdminColumn<MockTherapist>[] = [
    { key: "name", header: "שם המטפל/ת", sortable: true, render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "title", header: "כותרת מקצועית", render: (row) => row.title },
    { key: "profileStatus", header: "סטטוס פרופיל", render: (row) => <AdminStatusBadge status={row.profileStatus} /> },
    { key: "accountStatus", header: "סטטוס חשבון", render: (row) => <AdminStatusBadge status={row.accountStatus} /> },
    {
      key: "verificationStatus",
      header: "סטטוס אימות",
      render: (row) => <AdminStatusBadge status={row.verificationStatus} />,
    },
    { key: "joinedAt", header: "הצטרפות", sortable: true, hideOnNarrow: true, render: (row) => row.joinedAt },
    { key: "lastActiveAt", header: "פעילות אחרונה", sortable: true, hideOnNarrow: true, render: (row) => row.lastActiveAt },
    {
      key: "actions",
      header: "פעולות",
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row);
          }}
        >
          צפייה
        </Button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader title="מטפלים" subtitle="ניהול וצפייה בפרופילי המטפלים במערכת (נתוני הדגמה)" breadcrumb="מטפלים" />

      <AdminFilterBar>
        <AdminSearchField
          id="therapist-search"
          label="חיפוש לפי שם"
          placeholder="שם או כותרת מקצועית"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <AdminSelectFilter
          id="filter-profile"
          label="סטטוס פרופיל"
          value={profileStatus}
          onChange={(value) => {
            setProfileStatus(value);
            setPage(1);
          }}
          options={["פורסם", "טיוטה", "ממתין", "מוקפא"]}
        />
        <AdminSelectFilter
          id="filter-account"
          label="סטטוס חשבון"
          value={accountStatus}
          onChange={(value) => {
            setAccountStatus(value);
            setPage(1);
          }}
          options={["פעיל", "ממתין", "מוקפא"]}
        />
        <AdminSelectFilter
          id="filter-verification"
          label="סטטוס אימות"
          value={verification}
          onChange={(value) => {
            setVerification(value);
            setPage(1);
          }}
          options={["מאומת", "ממתין לאימות", "ללא אימות"]}
        />
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={paged}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelected(row)}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSort}
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.name}</span>
              <AdminStatusBadge status={row.profileStatus} />
            </div>
            <p className="text-xs text-muted-foreground">{row.title}</p>
            <div className="flex flex-wrap gap-1.5">
              <AdminStatusBadge status={row.accountStatus} />
              <AdminStatusBadge status={row.verificationStatus} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              הצטרפות {row.joinedAt} · פעילות אחרונה {row.lastActiveAt}
            </p>
          </div>
        )}
        footer={
          <AdminPagination page={currentPage} pageCount={pageCount} total={filtered.length} onPageChange={setPage} />
        }
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected ? selected.name : ""}
        description="נתוני הדגמה בלבד — אינם מקושרים לפרופיל אמיתי."
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרטים כלליים">
              <AdminDetailRow label="שם" value={selected.name} />
              <AdminDetailRow label="כותרת מקצועית" value={selected.title} />
              <AdminDetailRow label="תאריך הצטרפות" value={selected.joinedAt} />
              <AdminDetailRow label="פעילות אחרונה" value={selected.lastActiveAt} />
            </AdminDetailSection>

            <AdminDetailSection title="סטטוס">
              <AdminDetailRow label="סטטוס חשבון" value={<AdminStatusBadge status={selected.accountStatus} />} />
              <AdminDetailRow label="סטטוס פרופיל" value={<AdminStatusBadge status={selected.profileStatus} />} />
              <AdminDetailRow label="סטטוס אימות" value={<AdminStatusBadge status={selected.verificationStatus} />} />
            </AdminDetailSection>

            <AdminDetailSection title="פרטי פרופיל">
              <AdminDetailRow label="מקצוע" value={selected.profession} />
              <AdminDetailRow label="מיקום" value={selected.city} />
              <AdminDetailRow label="תחומי טיפול" value={selected.domains.join(", ") || "—"} />
            </AdminDetailSection>

            <AdminDetailSection title="פרטי קשר">
              <AdminDetailRow label="אימייל" value={selected.email} />
              <AdminDetailRow label="טלפון" value={selected.phone} />
            </AdminDetailSection>

            <AdminDetailSection title="אימותים">
              {selected.credentials.length === 0 ? (
                <p className="text-xs text-muted-foreground">לא הוגשו הסמכות (הדגמה).</p>
              ) : (
                selected.credentials.map((credential) => (
                  <AdminDetailRow
                    key={credential.type}
                    label={`${credential.type} · ${credential.authority}`}
                    value={<AdminStatusBadge status={credential.status} />}
                  />
                ))
              )}
            </AdminDetailSection>
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
