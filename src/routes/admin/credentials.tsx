import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDate } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminCredentialDocumentUrl,
  listAdminCredentials,
  reviewAdminCredential,
  type AdminCredentialRow,
} from "@/lib/admin-credentials.functions";

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

const STATUS_LABELS: Record<AdminCredentialRow["status"], string> = {
  unverified: "טרם הוגש",
  pending_review: "ממתין לבדיקה",
  verified: "מאומת",
  rejected: "נדחה",
  expired: "פג תוקף",
};

function CredentialsPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminCredentials);
  const documentFn = useServerFn(getAdminCredentialDocumentUrl);
  const reviewFn = useServerFn(reviewAdminCredential);
  const credentials = useQuery({ queryKey: ["admin-credentials"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ממתין לבדיקה");
  const [profession, setProfession] = useState("all");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const selected = (credentials.data ?? []).find((row) => row.id === selectedId) ?? null;
  const document = useQuery({
    queryKey: ["admin-credential-document", selectedId],
    queryFn: () => documentFn({ data: { credentialId: selectedId! } }),
    enabled: Boolean(selectedId && selected?.documentAvailable),
    staleTime: 4 * 60 * 1000,
  });
  const professions = useMemo(
    () => [...new Set((credentials.data ?? []).map((row) => row.professionName).filter(Boolean) as string[])],
    [credentials.data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("he");
    const rows = (credentials.data ?? []).filter((row) => {
      if (term) {
        const haystack = [
          row.therapistName,
          row.credentialType,
          row.licenseNumber ?? "",
          row.issuingAuthority ?? "",
          row.professionName ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("he");
        if (!haystack.includes(term)) return false;
      }
      if (status !== "all" && STATUS_LABELS[row.status] !== status) return false;
      if (profession !== "all" && row.professionName !== profession) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const compare = (a.submittedAt ?? a.id).localeCompare(b.submittedAt ?? b.id);
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [credentials.data, profession, search, sortDirection, status]);

  const reviewMutation = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      reviewFn({
        data: {
          credentialId: selected!.id,
          decision,
          reason: decision === "reject" ? rejectionReason : null,
        },
      }),
    onSuccess: async (result) => {
      toast.success(result.status === "verified" ? "ההסמכה אושרה." : "ההסמכה נדחתה.");
      closeDrawer();
      await queryClient.invalidateQueries({ queryKey: ["admin-credentials"] });
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את ההסמכה."),
  });

  function closeDrawer() {
    setSelectedId(null);
    setRejecting(false);
    setRejectionReason("");
  }

  const rows = credentials.data ?? [];
  const pendingCount = rows.filter((row) => row.status === "pending_review").length;
  const approvedCount = rows.filter((row) => row.status === "verified").length;
  const rejectedCount = rows.filter((row) => row.status === "rejected").length;

  const columns: AdminColumn<AdminCredentialRow>[] = [
    {
      key: "therapistName",
      header: "שם המטפל/ת",
      render: (row) => <span className="font-medium">{row.therapistName}</span>,
    },
    { key: "credentialType", header: "סוג ההסמכה", render: (row) => row.credentialType },
    {
      key: "profession",
      header: "מקצוע",
      hideOnNarrow: true,
      render: (row) => row.professionName || "—",
    },
    {
      key: "licenseNumber",
      header: "מספר רישיון",
      render: (row) => <span dir="ltr">{row.licenseNumber || "—"}</span>,
    },
    {
      key: "submittedAt",
      header: "תאריך הגשה",
      sortable: true,
      render: (row) => <span dir="ltr">{row.submittedAt ? formatAdminDate(row.submittedAt) : "—"}</span>,
    },
    {
      key: "status",
      header: "סטטוס",
      render: (row) => <AdminStatusBadge status={STATUS_LABELS[row.status]} />,
    },
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
          פרטים
        </Button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="אימות הסמכות"
        subtitle={credentials.isLoading ? "טוען בקשות…" : `${rows.length} הסמכות במערכת`}
        breadcrumb="אימות הסמכות"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <AdminStatCard label="ממתינות לבדיקה" value={pendingCount} />
        <AdminStatCard label="אושרו" value={approvedCount} />
        <AdminStatCard label="נדחו" value={rejectedCount} />
      </div>

      {credentials.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          לא ניתן לטעון את בקשות האימות.
        </div>
      ) : null}

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
          options={Object.values(STATUS_LABELS)}
        />
        <AdminSelectFilter
          id="credential-profession"
          label="מקצוע"
          value={profession}
          onChange={setProfession}
          options={professions}
        />
        <div className="pb-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}
          >
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
        onSortChange={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.therapistName}</span>
              <AdminStatusBadge status={STATUS_LABELS[row.status]} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.credentialType} · {row.professionName || "ללא מקצוע"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              הוגש {row.submittedAt ? formatAdminDate(row.submittedAt) : "ללא תאריך"}
            </p>
          </div>
        )}
        emptyTitle={credentials.isLoading ? "טוען…" : "אין בקשות מתאימות"}
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        title={selected ? `בדיקת הסמכה — ${selected.therapistName}` : ""}
        description={selected ? STATUS_LABELS[selected.status] : undefined}
        footer={
          selected?.status === "pending_review" ? (
            <div className="space-y-3">
              {rejecting ? (
                <div className="space-y-2">
                  <Label htmlFor="credential-rejection">סיבת הדחייה שתוצג למטפל/ת</Label>
                  <Textarea
                    id="credential-rejection"
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    maxLength={1000}
                    rows={3}
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" onClick={() => reviewMutation.mutate("approve")} disabled={reviewMutation.isPending}>
                  אישור ההסמכה
                </Button>
                {rejecting ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => reviewMutation.mutate("reject")}
                    disabled={reviewMutation.isPending || rejectionReason.trim().length < 3}
                  >
                    אישור הדחייה
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                    דחייה
                  </Button>
                )}
              </div>
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרטי הבקשה">
              <AdminDetailRow label="שם המטפל/ת" value={selected.therapistName} />
              <AdminDetailRow label="סוג ההסמכה" value={selected.credentialType} />
              <AdminDetailRow label="מקצוע" value={selected.professionName || "—"} />
              <AdminDetailRow label="גוף מעניק" value={selected.issuingAuthority || "—"} />
              <AdminDetailRow label="מוסד" value={selected.institution || "—"} />
              <AdminDetailRow label="מספר רישיון" value={<span dir="ltr">{selected.licenseNumber || "—"}</span>} />
              <AdminDetailRow
                label="תאריך קבלה"
                value={selected.issueDate ? formatAdminDate(selected.issueDate) : "—"}
              />
              <AdminDetailRow
                label="תאריך הגשה"
                value={selected.submittedAt ? formatAdminDate(selected.submittedAt) : "—"}
              />
              <AdminDetailRow label="סטטוס" value={<AdminStatusBadge status={STATUS_LABELS[selected.status]} />} />
            </AdminDetailSection>

            <AdminDetailSection title="מסמך">
              {!selected.documentAvailable ? (
                <p className="text-sm text-muted-foreground">לא צורף מסמך.</p>
              ) : document.isLoading ? (
                <p className="text-sm text-muted-foreground">מכין תצוגה מאובטחת…</p>
              ) : document.isError ? (
                <div>
                  <p className="text-sm text-destructive">לא ניתן לפתוח את המסמך.</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => void document.refetch()}>
                    ניסיון חוזר
                  </Button>
                </div>
              ) : document.data ? (
                <Button asChild size="sm" variant="outline">
                  <a href={document.data.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    פתיחת המסמך
                  </a>
                </Button>
              ) : null}
            </AdminDetailSection>

            {selected.rejectionReason ? (
              <AdminDetailSection title="סיבת דחייה">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{selected.rejectionReason}</p>
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
