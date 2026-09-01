import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Columns3 } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDateTime } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveAdminClaimRequest,
  approveAdminRemovalRequest,
  listAdminClaims,
  rejectAdminProfileRequest,
  resendAdminClaimInvite,
  type AdminClaimKind,
  type AdminClaimRow,
  type AdminClaimSortKey,
  type AdminClaimStatus,
  type AdminOwnershipVerificationCategory,
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

const STATUS_LABELS: Record<AdminClaimStatus, string> = {
  invite_pending: "ממתין לשליחה",
  invite_sent: "הזמנה נשלחה",
  invite_failed: "שליחה נכשלה",
  invite_accepted: "בעלות התקבלה",
  invite_expired: "הזמנה פגה",
  invite_revoked: "הזמנה בוטלה",
  request_pending: "ממתין לבדיקה",
  request_verification_pending: "ממתין לאימות",
  request_approved: "אושר",
  request_rejected: "נדחה",
  request_cancelled: "בוטל",
};

const TYPE_LABELS: Record<AdminClaimKind, string> = {
  invite: "הזמנת בעלות",
  claim_request: "בקשת בעלות יזומה",
  removal_request: "בקשת הסרה",
};

const VERIFICATION_LABELS: Record<AdminOwnershipVerificationCategory, string> = {
  email: "אימייל",
  phone: "טלפון",
  manual_review: "בדיקה ידנית",
  unverified: "טרם אומת",
};

const COLUMN_STORAGE_KEY = "tipulinks.admin.claims.columns.v1";
const PAGE_SIZE_STORAGE_KEY = "tipulinks.admin.claims.page-size.v1";
const CLAIM_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_VISIBLE_COLUMNS = [
  "therapistName",
  "kind",
  "requesterEmail",
  "verificationMethod",
  "createdAt",
  "waitingTime",
  "status",
  "actions",
];
const REQUIRED_COLUMNS = new Set(["therapistName", "status", "actions"]);

const COLUMN_LABELS: Record<string, string> = {
  therapistName: "שם המטפל/ת",
  kind: "סוג",
  requesterEmail: "אימייל מבקש/ת הבעלות",
  profileEmail: "אימייל מקצועי בפרופיל",
  verificationMethod: "דרך אימות הבעלות",
  createdAt: "מועד הבקשה",
  waitingTime: "זמן המתנה",
  resolvedAt: "מועד טיפול",
  ownership: "מצב בעלות",
  profileStatus: "מצב הפרופיל",
  rejectionReason: "סיבת דחייה",
  status: "סטטוס",
  actions: "פעולות",
};

function loadPageSize(): number {
  if (typeof window === "undefined") return 25;
  const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  return CLAIM_PAGE_SIZE_OPTIONS.includes(stored as (typeof CLAIM_PAGE_SIZE_OPTIONS)[number]) ? stored : 25;
}

function isWaiting(row: AdminClaimRow): boolean {
  return ["request_pending", "request_verification_pending", "invite_pending", "invite_sent", "invite_failed"].includes(
    row.status,
  );
}

function waitingTimeLabel(row: AdminClaimRow): string {
  if (!isWaiting(row)) return "—";
  const created = new Date(row.createdAt).getTime();
  if (!Number.isFinite(created)) return "—";
  const elapsedHours = Math.max(0, Math.floor((Date.now() - created) / (60 * 60 * 1000)));
  if (elapsedHours < 1) return "פחות משעה";
  if (elapsedHours < 24) return `${elapsedHours} שעות`;
  const days = Math.floor(elapsedHours / 24);
  return `${days} ימים`;
}

function ownershipLabel(row: AdminClaimRow): string {
  if (row.ownerAccountId) return "בבעלות המטפל/ת";
  if (row.doNotRepublish) return "חסום לפרסום מחדש";
  return "ללא בעלות";
}

function profileStatusLabel(row: AdminClaimRow): string {
  if (row.doNotRepublish) return "הוסר/חסום";
  if (row.profileStatus === "published" && row.isActive) return "פורסם";
  if (row.profileStatus === "published") return "מוקפא";
  if (row.profileStatus === "completed") return "מוכן לפרסום";
  return "טיוטה";
}

function ClaimsPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminClaims);
  const approveClaimFn = useServerFn(approveAdminClaimRequest);
  const resendFn = useServerFn(resendAdminClaimInvite);
  const approveRemovalFn = useServerFn(approveAdminRemovalRequest);
  const rejectFn = useServerFn(rejectAdminProfileRequest);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<AdminClaimStatus | "all">("all");
  const [kind, setKind] = useState<AdminClaimKind | "all">("all");
  const [verificationCategory, setVerificationCategory] = useState<AdminOwnershipVerificationCategory | "all">("all");
  const [ageDays, setAgeDays] = useState<"all" | "7" | "30" | "90">("all");
  const [sortKey, setSortKey] = useState<AdminClaimSortKey>("priority");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"existing_email" | "existing_phone" | "manual_review">(
    "manual_review",
  );
  const [confirmAction, setConfirmAction] = useState<"claim" | "removal" | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE_COLUMNS));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(COLUMN_STORAGE_KEY) ?? "null") as unknown;
      if (Array.isArray(stored)) {
        const next = new Set(stored.filter((value): value is string => typeof value === "string"));
        for (const key of REQUIRED_COLUMNS) next.add(key);
        setVisibleColumns(next);
      }
    } catch {
      // Keep safe defaults if the local preference is corrupt.
    }
  }, []);

  const claims = useQuery({
    queryKey: [
      "admin-claims",
      {
        page,
        pageSize,
        search: deferredSearch,
        status,
        kind,
        verificationCategory,
        ageDays,
        sortKey,
        sortDirection,
      },
    ],
    queryFn: () =>
      listFn({
        data: {
          page,
          pageSize: pageSize as 10 | 25 | 50 | 100,
          search: deferredSearch,
          status: status === "all" ? null : status,
          kind: kind === "all" ? null : kind,
          verificationCategory: verificationCategory === "all" ? null : verificationCategory,
          ageDays: ageDays === "all" ? null : (Number(ageDays) as 7 | 30 | 90),
          sortKey,
          sortDirection,
        },
      }),
  });

  useEffect(() => {
    if (claims.data && page > claims.data.pageCount) setPage(claims.data.pageCount);
  }, [claims.data, page]);

  const selected = claims.data?.rows.find((row) => `${row.kind}-${row.id}` === selectedKey) ?? null;

  function resetPage() {
    setPage(1);
  }

  function close() {
    setSelectedKey(null);
    setRejecting(false);
    setReason("");
    setVerificationMethod("manual_review");
    setConfirmAction(null);
  }

  async function refreshRelatedData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-claims"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-therapists"] }),
    ]);
  }

  const approveClaimMutation = useMutation({
    mutationFn: (row: AdminClaimRow) => approveClaimFn({ data: { requestId: row.id } }),
    onSuccess: async (result) => {
      toast.success(
        result.invitationStatus === "already_pending"
          ? "כבר קיימת הזמנת אימות פעילה לפרופיל."
          : "בקשת הבעלות אושרה והזמנת האימות נשלחה לאימייל המקצועי הקיים בפרופיל.",
      );
      close();
      await refreshRelatedData();
    },
    onError: (error: Error) => toast.error(error.message || "אישור בקשת הבעלות נכשל."),
  });

  const resendMutation = useMutation({
    mutationFn: (row: AdminClaimRow) =>
      resendFn({ data: { therapistId: row.therapistId, sourceLeadId: row.sourceLeadId } }),
    onSuccess: async () => {
      toast.success("הזמנת הבעלות נשלחה מחדש.");
      await refreshRelatedData();
    },
    onError: (error: Error) => toast.error(error.message || "שליחת ההזמנה נכשלה."),
  });

  const approveRemovalMutation = useMutation({
    mutationFn: (row: AdminClaimRow) => approveRemovalFn({ data: { requestId: row.id, verificationMethod } }),
    onSuccess: async () => {
      toast.success("הפרופיל הוסר מהאתר ונחסם לפרסום מחדש.");
      close();
      await refreshRelatedData();
    },
    onError: (error: Error) => toast.error(error.message || "אישור ההסרה נכשל."),
  });

  const rejectMutation = useMutation({
    mutationFn: (row: AdminClaimRow) => rejectFn({ data: { requestId: row.id, reason } }),
    onSuccess: async () => {
      toast.success("הבקשה נדחתה.");
      close();
      await refreshRelatedData();
    },
    onError: (error: Error) => toast.error(error.message || "דחיית הבקשה נכשלה."),
  });

  function handleSort(key: string) {
    const nextKey = key as AdminClaimSortKey;
    if (nextKey === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
    resetPage();
  }

  function toggleColumn(key: string, visible: boolean) {
    if (REQUIRED_COLUMNS.has(key)) return;
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (visible) next.add(key);
      else next.delete(key);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...next]));
      }
      return next;
    });
  }

  const allColumns: AdminColumn<AdminClaimRow>[] = useMemo(
    () => [
      {
        key: "therapistName",
        header: "שם המטפל/ת",
        sortable: true,
        render: (row) => <span className="font-medium">{row.therapistName}</span>,
      },
      { key: "kind", header: "סוג", sortable: true, render: (row) => TYPE_LABELS[row.kind] },
      {
        key: "requesterEmail",
        header: "אימייל מבקש/ת",
        sortable: true,
        hideOnNarrow: true,
        render: (row) => <span dir="ltr">{row.requesterEmail || "—"}</span>,
      },
      {
        key: "profileEmail",
        header: "אימייל מקצועי",
        hideOnNarrow: true,
        render: (row) => <span dir="ltr">{row.profileEmail || "—"}</span>,
      },
      {
        key: "verificationMethod",
        header: "דרך אימות הבעלות",
        sortable: true,
        render: (row) => VERIFICATION_LABELS[row.verificationCategory],
      },
      {
        key: "createdAt",
        header: "מועד הבקשה",
        sortable: true,
        render: (row) => <span dir="ltr">{formatAdminDateTime(row.createdAt)}</span>,
      },
      { key: "waitingTime", header: "זמן המתנה", render: (row) => waitingTimeLabel(row) },
      {
        key: "resolvedAt",
        header: "מועד טיפול",
        sortable: true,
        hideOnNarrow: true,
        render: (row) => <span dir="ltr">{row.resolvedAt ? formatAdminDateTime(row.resolvedAt) : "—"}</span>,
      },
      { key: "ownership", header: "מצב בעלות", hideOnNarrow: true, render: (row) => ownershipLabel(row) },
      { key: "profileStatus", header: "מצב הפרופיל", hideOnNarrow: true, render: (row) => profileStatusLabel(row) },
      {
        key: "rejectionReason",
        header: "סיבת דחייה",
        hideOnNarrow: true,
        render: (row) => (row.status === "request_rejected" ? row.reviewNote || "—" : "—"),
      },
      {
        key: "status",
        header: "סטטוס",
        sortable: true,
        render: (row) => <AdminStatusBadge status={STATUS_LABELS[row.status]} />,
      },
      {
        key: "actions",
        header: "פעולות",
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedKey(`${row.kind}-${row.id}`);
              }}
            >
              עיון
            </Button>
            <Button asChild variant="outline" size="sm" onClick={(event) => event.stopPropagation()}>
              <Link to="/admin/therapists" search={{ therapistId: row.therapistId }} target="_blank" rel="noreferrer">
                פרופיל
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const columns = allColumns.filter((column) => visibleColumns.has(column.key) || REQUIRED_COLUMNS.has(column.key));
  const canReviewRequest =
    selected?.status === "request_pending" || selected?.status === "request_verification_pending";
  const canApproveClaim =
    selected?.kind === "claim_request" && selected.status === "request_pending" && !selected.reviewedBy;
  const canResend =
    (selected?.kind === "invite" && selected.status !== "invite_accepted" && selected.status !== "invite_revoked") ||
    (selected?.kind === "claim_request" && selected.status === "request_verification_pending");

  return (
    <div>
      <AdminPageHeader
        title="בקשות בעלות והסרה"
        subtitle={
          claims.isLoading
            ? "טוען בקשות…"
            : `${claims.data?.total ?? 0} רשומות תואמות · בקשות שמצריכות טיפול מוצגות תחילה${claims.isFetching ? " · מעדכן…" : ""}`
        }
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
          placeholder="שם מטפל/ת, אימייל או מזהה"
          value={search}
          onChange={(value) => {
            setSearch(value);
            resetPage();
          }}
        />
        <AdminSelectFilter
          id="claim-type"
          label="סוג"
          value={kind}
          onChange={(value) => {
            setKind(value as AdminClaimKind | "all");
            resetPage();
          }}
          options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <AdminSelectFilter
          id="claim-status"
          label="סטטוס"
          value={status}
          onChange={(value) => {
            setStatus(value as AdminClaimStatus | "all");
            resetPage();
          }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <AdminSelectFilter
          id="claim-verification"
          label="דרך אימות"
          value={verificationCategory}
          onChange={(value) => {
            setVerificationCategory(value as AdminOwnershipVerificationCategory | "all");
            resetPage();
          }}
          options={Object.entries(VERIFICATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <AdminSelectFilter
          id="claim-period"
          label="תקופה"
          value={ageDays}
          onChange={(value) => {
            setAgeDays(value as "all" | "7" | "30" | "90");
            resetPage();
          }}
          options={[
            { value: "7", label: "7 ימים אחרונים" },
            { value: "30", label: "30 ימים אחרונים" },
            { value: "90", label: "90 ימים אחרונים" },
          ]}
        />
        <div className="ms-auto">
          <Label className="mb-1 block text-xs text-muted-foreground">עמודות</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                בחירת עמודות
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>עמודות מוצגות</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={visibleColumns.has(column.key) || REQUIRED_COLUMNS.has(column.key)}
                  disabled={REQUIRED_COLUMNS.has(column.key)}
                  onCheckedChange={(checked) => toggleColumn(column.key, Boolean(checked))}
                  onSelect={(event) => event.preventDefault()}
                >
                  {COLUMN_LABELS[column.key] ?? column.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={claims.data?.rows ?? []}
        getRowId={(row) => `${row.kind}-${row.id}`}
        onRowClick={(row) => setSelectedKey(`${row.kind}-${row.id}`)}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSort}
        pagination={
          claims.data
            ? {
                page,
                pageCount: claims.data.pageCount,
                pageSize,
                total: claims.data.total,
                pageSizeOptions: CLAIM_PAGE_SIZE_OPTIONS,
                showPageNumbers: true,
                onPageChange: setPage,
                onPageSizeChange: (nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(nextPageSize));
                  }
                },
              }
            : undefined
        }
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{row.therapistName}</span>
              <AdminStatusBadge status={STATUS_LABELS[row.status]} />
            </div>
            <p className="text-xs text-muted-foreground">{TYPE_LABELS[row.kind]}</p>
            <p className="text-xs text-muted-foreground">
              דרך אימות: {VERIFICATION_LABELS[row.verificationCategory]} · זמן המתנה: {waitingTimeLabel(row)}
            </p>
            {row.requesterEmail ? (
              <p className="text-[11px] text-muted-foreground" dir="ltr">
                {row.requesterEmail}
              </p>
            ) : null}
          </div>
        )}
        emptyTitle={claims.isLoading ? "טוען…" : "אין בקשות מתאימות"}
        emptyDescription="נסו לשנות את החיפוש או המסננים."
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
              <Button asChild variant="outline" size="sm">
                <Link
                  to="/admin/therapists"
                  search={{ therapistId: selected.therapistId }}
                  target="_blank"
                  rel="noreferrer"
                >
                  פתיחת הפרופיל באדמין
                </Link>
              </Button>
              {canApproveClaim ? (
                <Button size="sm" onClick={() => setConfirmAction("claim")} disabled={approveClaimMutation.isPending}>
                  {selected.activeProfileInvite ? "אישור והמשך אימות" : "אישור ושליחת הזמנה"}
                </Button>
              ) : null}
              {canResend ? (
                <Button size="sm" onClick={() => resendMutation.mutate(selected)} disabled={resendMutation.isPending}>
                  {resendMutation.isPending ? "שולח…" : "שליחה מחדש"}
                </Button>
              ) : null}
              {selected.kind === "removal_request" && canReviewRequest ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmAction("removal")}
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
                    {rejectMutation.isPending ? "דוחה…" : "אישור דחייה"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                    דחיית בקשה
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
              <AdminDetailRow label="מזהה פרופיל" value={<span dir="ltr">{selected.therapistId}</span>} />
              <AdminDetailRow label="כותרת מקצועית" value={selected.professionalTitle || "—"} />
              <AdminDetailRow label="אימייל מקצועי" value={<span dir="ltr">{selected.profileEmail || "—"}</span>} />
              <AdminDetailRow label="מצב בעלות" value={<AdminStatusBadge status={ownershipLabel(selected)} />} />
              <AdminDetailRow label="מצב פרופיל" value={<AdminStatusBadge status={profileStatusLabel(selected)} />} />
            </AdminDetailSection>

            <AdminDetailSection title="הבקשה">
              <AdminDetailRow label="סוג" value={TYPE_LABELS[selected.kind]} />
              <AdminDetailRow label="סטטוס" value={<AdminStatusBadge status={STATUS_LABELS[selected.status]} />} />
              <AdminDetailRow label="דרך אימות הבעלות" value={VERIFICATION_LABELS[selected.verificationCategory]} />
              <AdminDetailRow label="נוצרה" value={<span dir="ltr">{formatAdminDateTime(selected.createdAt)}</span>} />
              <AdminDetailRow label="זמן המתנה" value={waitingTimeLabel(selected)} />
              <AdminDetailRow
                label="טופלה"
                value={selected.resolvedAt ? <span dir="ltr">{formatAdminDateTime(selected.resolvedAt)}</span> : "—"}
              />
            </AdminDetailSection>

            {selected.kind === "invite" ? (
              <AdminDetailSection title="מסירת ההזמנה">
                <AdminDetailRow label="ערוץ אימות" value="אימייל" />
                <AdminDetailRow
                  label="נשלחה"
                  value={selected.sentAt ? formatAdminDateTime(selected.sentAt) : "טרם נשלחה"}
                />
                <AdminDetailRow
                  label="תוקף"
                  value={selected.expiresAt ? formatAdminDateTime(selected.expiresAt) : "—"}
                />
                <AdminDetailRow
                  label="התקבלה"
                  value={selected.acceptedAt ? formatAdminDateTime(selected.acceptedAt) : "—"}
                />
                <AdminDetailRow label="מזהה הודעה" value={<span dir="ltr">{selected.providerMessageId || "—"}</span>} />
                <AdminDetailRow label="ליד מקור" value={<span dir="ltr">{selected.sourceLeadId || "—"}</span>} />
                {selected.lastDeliveryError ? (
                  <AdminDetailRow label="שגיאה אחרונה" value={selected.lastDeliveryError} />
                ) : null}
              </AdminDetailSection>
            ) : (
              <AdminDetailSection title="פרטי מבקש/ת הבקשה">
                <AdminDetailRow label="שם שנמסר" value={selected.requesterName || "—"} />
                <AdminDetailRow label="אימייל שנמסר" value={<span dir="ltr">{selected.requesterEmail || "—"}</span>} />
                <AdminDetailRow label="טלפון שנמסר" value={<span dir="ltr">{selected.requesterPhone || "—"}</span>} />
                <AdminDetailRow label="הערה" value={selected.requestNote || "—"} />
                {selected.reviewNote ? (
                  <AdminDetailRow label="הערת בדיקה / סיבת דחייה" value={selected.reviewNote} />
                ) : null}
                {selected.kind === "claim_request" && selected.status === "request_verification_pending" ? (
                  <AdminDetailRow
                    label="הזמנת אימות"
                    value={
                      selected.activeProfileInvite
                        ? "קיימת הזמנה פעילה לאימייל המקצועי שבפרופיל"
                        : "הבקשה אושרה לבדיקה אך אין כרגע הזמנה פעילה; ניתן לבצע שליחה מחדש"
                    }
                  />
                ) : null}
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
                  maxLength={1000}
                />
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction === "claim" ? "אישור בקשת בעלות" : "אישור הסרת פרופיל"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "claim"
                ? selected?.activeProfileInvite
                  ? "כבר קיימת לפרופיל הזמנת אימות פעילה שנשלחה לאימייל המקצועי. הפעולה תאשר את הבקשה להמשך האימות באמצעות ההזמנה הקיימת, בלי לשלוח הזמנה כפולה. הבעלות לא תועבר עד שההזמנה תתקבל מחשבון עם אימייל מאומת ותואם."
                  : "הפעולה תשלח הזמנת אימות לכתובת האימייל המקצועית שכבר שמורה בפרופיל. הבעלות לא תועבר עד שההזמנה תתקבל מחשבון עם אימייל מאומת ותואם."
                : "הפעולה תסיר את הפרופיל מהאתר ותחסום אותו מפרסום מחדש בהתאם למסלול ההסרה הקיים."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!selected) return;
                if (confirmAction === "claim") approveClaimMutation.mutate(selected);
                if (confirmAction === "removal") approveRemovalMutation.mutate(selected);
                setConfirmAction(null);
              }}
            >
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
