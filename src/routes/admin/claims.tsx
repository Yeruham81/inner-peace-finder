import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDate } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveAdminRemovalRequest,
  listAdminClaims,
  rejectAdminProfileRequest,
  resendAdminClaimInvite,
  type AdminClaimRow,
} from "@/lib/admin-claims.functions";

export const Route = createFileRoute("/admin/claims")({
  head: () => ({
    meta: [
      { title: "בקשות בעלות והסרה | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ניהול הזמנות בעלות ובקשות הסרת פרופיל" },
    ],
  }),
  component: ClaimsPage,
});

const STATUS_LABELS: Record<AdminClaimRow["status"], string> = {
  invite_pending: "ממתין לשליחה",
  invite_sent: "הזמנה נשלחה",
  invite_failed: "שליחה נכשלה",
  invite_accepted: "בעלות התקבלה",
  invite_expired: "הזמנה פגה",
  invite_revoked: "הזמנה בוטלה",
  request_pending: "ממתין לבדיקה",
  request_approved: "אושר",
  request_rejected: "נדחה",
};

const TYPE_LABELS: Record<AdminClaimRow["kind"], string> = {
  invite: "הזמנת בעלות",
  claim_request: "בקשת בעלות יזומה",
  removal_request: "בקשת הסרה",
};

function ClaimsPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminClaims);
  const resendFn = useServerFn(resendAdminClaimInvite);
  const approveRemovalFn = useServerFn(approveAdminRemovalRequest);
  const rejectFn = useServerFn(rejectAdminProfileRequest);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"existing_email" | "existing_phone" | "manual_review">(
    "manual_review",
  );

  const claims = useQuery({ queryKey: ["admin-claims"], queryFn: () => listFn() });
  const selected = (claims.data ?? []).find((row) => row.id === selectedId) ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-claims"] });
  const resendMutation = useMutation({
    mutationFn: (row: AdminClaimRow) =>
      resendFn({ data: { therapistId: row.therapistId, sourceLeadId: row.sourceLeadId } }),
    onSuccess: async () => {
      toast.success("הזמנת הבעלות נשלחה.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || "שליחת ההזמנה נכשלה."),
  });
  const approveRemovalMutation = useMutation({
    mutationFn: (row: AdminClaimRow) =>
      approveRemovalFn({
        data: { requestId: row.id, verificationMethod },
      }),
    onSuccess: async () => {
      toast.success("הפרופיל הוסר מהאתר ונחסם לפרסום מחדש.");
      close();
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || "אישור ההסרה נכשל."),
  });
  const rejectMutation = useMutation({
    mutationFn: (row: AdminClaimRow) => rejectFn({ data: { requestId: row.id, reason } }),
    onSuccess: async () => {
      toast.success("הבקשה נדחתה.");
      close();
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message || "דחיית הבקשה נכשלה."),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("he");
    return (claims.data ?? []).filter((row) => {
      if (term) {
        const haystack = [row.therapistName, row.profileEmail ?? "", row.requesterName ?? "", row.requesterEmail ?? ""]
          .join(" ")
          .toLocaleLowerCase("he");
        if (!haystack.includes(term)) return false;
      }
      if (status !== "all" && STATUS_LABELS[row.status] !== status) return false;
      if (kind !== "all" && TYPE_LABELS[row.kind] !== kind) return false;
      return true;
    });
  }, [claims.data, kind, search, status]);

  function close() {
    setSelectedId(null);
    setRejecting(false);
    setReason("");
    setVerificationMethod("manual_review");
  }

  const columns: AdminColumn<AdminClaimRow>[] = [
    {
      key: "therapistName",
      header: "מטפל/ת",
      render: (row) => <span className="font-medium">{row.therapistName}</span>,
    },
    { key: "kind", header: "סוג", render: (row) => TYPE_LABELS[row.kind] },
    {
      key: "email",
      header: "אימייל מקצועי",
      hideOnNarrow: true,
      render: (row) => <span dir="ltr">{row.profileEmail || "—"}</span>,
    },
    {
      key: "createdAt",
      header: "נוצר",
      render: (row) => <span dir="ltr">{formatAdminDate(row.createdAt)}</span>,
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

  const canResend =
    selected?.kind === "claim_request" || (selected?.kind === "invite" && selected.status !== "invite_accepted");
  const canReviewRequest = selected?.status === "request_pending";

  return (
    <div>
      <AdminPageHeader
        title="בקשות בעלות והסרה"
        subtitle={claims.isLoading ? "טוען בקשות…" : `${claims.data?.length ?? 0} רשומות במערכת`}
        breadcrumb="בקשות בעלות"
      />

      {claims.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          לא ניתן לטעון את הבקשות. {claims.error instanceof Error ? claims.error.message : ""}
        </div>
      ) : null}

      <AdminFilterBar>
        <AdminSearchField
          id="claim-search"
          label="חיפוש"
          placeholder="שם מטפל/ת או אימייל"
          value={search}
          onChange={setSearch}
        />
        <AdminSelectFilter
          id="claim-type"
          label="סוג"
          value={kind}
          onChange={setKind}
          options={Object.values(TYPE_LABELS)}
        />
        <AdminSelectFilter
          id="claim-status"
          label="סטטוס"
          value={status}
          onChange={setStatus}
          options={[...new Set(Object.values(STATUS_LABELS))]}
        />
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        getRowId={(row) => `${row.kind}-${row.id}`}
        onRowClick={(row) => setSelectedId(row.id)}
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.therapistName}</span>
              <AdminStatusBadge status={STATUS_LABELS[row.status]} />
            </div>
            <p className="text-xs text-muted-foreground">{TYPE_LABELS[row.kind]}</p>
            <p className="text-[11px] text-muted-foreground" dir="ltr">
              {row.profileEmail || "—"} · {formatAdminDate(row.createdAt)}
            </p>
          </div>
        )}
        emptyTitle={claims.isLoading ? "טוען…" : "אין בקשות מתאימות"}
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={selected ? `${TYPE_LABELS[selected.kind]} — ${selected.therapistName}` : ""}
        description={selected ? STATUS_LABELS[selected.status] : undefined}
        footer={
          selected ? (
            <div className="flex flex-wrap justify-end gap-2">
              {canResend ? (
                <Button size="sm" onClick={() => resendMutation.mutate(selected)} disabled={resendMutation.isPending}>
                  {resendMutation.isPending
                    ? "שולח…"
                    : selected.kind === "claim_request"
                      ? "שליחת הזמנה"
                      : "שליחה מחדש"}
                </Button>
              ) : null}
              {selected.kind === "removal_request" && canReviewRequest ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => approveRemovalMutation.mutate(selected)}
                  disabled={approveRemovalMutation.isPending}
                >
                  אישור הסרה
                </Button>
              ) : null}
              {selected.kind !== "invite" && canReviewRequest ? (
                rejecting ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reason.trim().length < 3 || rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(selected)}
                  >
                    אישור דחייה
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                    דחייה
                  </Button>
                )
              ) : null}
            </div>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרופיל">
              <AdminDetailRow label="שם" value={selected.therapistName} />
              <AdminDetailRow label="כותרת מקצועית" value={selected.professionalTitle || "—"} />
              <AdminDetailRow label="אימייל מקצועי" value={<span dir="ltr">{selected.profileEmail || "—"}</span>} />
              <AdminDetailRow label="סטטוס" value={<AdminStatusBadge status={STATUS_LABELS[selected.status]} />} />
            </AdminDetailSection>

            {selected.kind === "invite" ? (
              <AdminDetailSection title="מסירת ההזמנה">
                <AdminDetailRow
                  label="נשלחה"
                  value={selected.sentAt ? formatAdminDate(selected.sentAt) : "טרם נשלחה"}
                />
                <AdminDetailRow label="תוקף" value={selected.expiresAt ? formatAdminDate(selected.expiresAt) : "—"} />
                <AdminDetailRow
                  label="התקבלה"
                  value={selected.acceptedAt ? formatAdminDate(selected.acceptedAt) : "—"}
                />
                <AdminDetailRow label="מזהה הודעה" value={<span dir="ltr">{selected.providerMessageId || "—"}</span>} />
                <AdminDetailRow label="ליד מקור" value={<span dir="ltr">{selected.sourceLeadId || "—"}</span>} />
                {selected.lastDeliveryError ? (
                  <AdminDetailRow label="שגיאה אחרונה" value={selected.lastDeliveryError} />
                ) : null}
              </AdminDetailSection>
            ) : (
              <AdminDetailSection title="פרטי המבקש/ת">
                <AdminDetailRow label="שם" value={selected.requesterName || "—"} />
                <AdminDetailRow label="אימייל" value={<span dir="ltr">{selected.requesterEmail || "—"}</span>} />
                <AdminDetailRow label="טלפון" value={<span dir="ltr">{selected.requesterPhone || "—"}</span>} />
                <AdminDetailRow label="הערה" value={selected.requestNote || "—"} />
                {selected.reviewNote ? <AdminDetailRow label="הערת בדיקה" value={selected.reviewNote} /> : null}
              </AdminDetailSection>
            )}

            {selected.kind === "removal_request" && canReviewRequest ? (
              <AdminDetailSection title="אימות לפני הסרה">
                <Label htmlFor="removal-verification" className="text-xs text-muted-foreground">
                  אופן האימות
                </Label>
                <select
                  id="removal-verification"
                  value={verificationMethod}
                  onChange={(event) =>
                    setVerificationMethod(event.target.value as "existing_email" | "existing_phone" | "manual_review")
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="manual_review">בדיקה ידנית</option>
                  <option value="existing_email">אימייל מקצועי קיים</option>
                  <option value="existing_phone">טלפון קיים</option>
                </select>
              </AdminDetailSection>
            ) : null}

            {rejecting ? (
              <AdminDetailSection title="דחיית הבקשה">
                <Label htmlFor="claim-reason" className="text-xs text-muted-foreground">
                  סיבת הדחייה
                </Label>
                <Textarea
                  id="claim-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                />
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
