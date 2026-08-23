import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import {
  AdminDetailDrawer,
  AdminDetailRow,
  AdminDetailSection,
} from "@/components/admin/admin-detail-drawer";
import {
  AdminFilterBar,
  AdminSearchField,
  AdminSelectFilter,
} from "@/components/admin/admin-filter-bar";
import { formatAdminDateTime } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  listAdminSupportRequests,
  reviewAdminSupportRequest,
  type AdminSupportRequest,
  type SupportStatus,
} from "@/lib/admin-support.functions";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "פניות לצוות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "טיפול בפניות מטפלים לצוות טיפולינקס" },
    ],
  }),
  component: AdminSupportPage,
});

const STATUS_LABELS: Record<SupportStatus, string> = {
  new: "חדשה",
  in_review: "בטיפול",
  resolved: "נפתרה",
  closed: "נסגרה",
};

const CATEGORY_LABELS: Record<AdminSupportRequest["category"], string> = {
  bug: "תקלה",
  complaint: "תלונה",
  suggestion: "הצעה לשיפור",
  other: "עניין אחר",
};

function AdminSupportPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminSupportRequests);
  const reviewFn = useServerFn(reviewAdminSupportRequest);
  const requests = useQuery({ queryKey: ["admin-support-requests"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<SupportStatus>("in_review");
  const [staffResponse, setStaffResponse] = useState("");

  const selected = (requests.data ?? []).find((request) => request.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("he");
    return (requests.data ?? []).filter((request) => {
      if (term) {
        const haystack = [
          request.therapistName ?? "",
          request.accountEmail ?? "",
          request.subject,
          request.message,
        ]
          .join(" ")
          .toLocaleLowerCase("he");
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter !== "all" && STATUS_LABELS[request.status] !== statusFilter) return false;
      if (categoryFilter !== "all" && CATEGORY_LABELS[request.category] !== categoryFilter)
        return false;
      return true;
    });
  }, [categoryFilter, requests.data, search, statusFilter]);

  const reviewMutation = useMutation({
    mutationFn: () =>
      reviewFn({
        data: {
          requestId: selected!.id,
          status: nextStatus,
          staffResponse: staffResponse.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("הפנייה עודכנה.");
      closeDrawer();
      await queryClient.invalidateQueries({ queryKey: ["admin-support-requests"] });
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את הפנייה."),
  });

  function openDrawer(request: AdminSupportRequest) {
    setSelectedId(request.id);
    setNextStatus(request.status === "new" ? "in_review" : request.status);
    setStaffResponse(request.staffResponse ?? "");
  }

  function closeDrawer() {
    setSelectedId(null);
    setNextStatus("in_review");
    setStaffResponse("");
  }

  const rows = requests.data ?? [];
  const columns: AdminColumn<AdminSupportRequest>[] = [
    {
      key: "requester",
      header: "פונה",
      render: (row) => (
        <span className="font-medium">{row.therapistName || row.accountEmail || "חשבון מטפל"}</span>
      ),
    },
    { key: "category", header: "סוג", render: (row) => CATEGORY_LABELS[row.category] },
    { key: "subject", header: "נושא", render: (row) => row.subject },
    {
      key: "createdAt",
      header: "נוצר",
      hideOnNarrow: true,
      render: (row) => <span dir="ltr">{formatAdminDateTime(row.createdAt)}</span>,
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
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            openDrawer(row);
          }}
        >
          טיפול
        </Button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="פניות לצוות"
        subtitle={requests.isLoading ? "טוען פניות…" : `${rows.length} פניות במערכת`}
        breadcrumb="פניות לצוות"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <AdminStatCard label="חדשות" value={rows.filter((row) => row.status === "new").length} />
        <AdminStatCard
          label="בטיפול"
          value={rows.filter((row) => row.status === "in_review").length}
        />
        <AdminStatCard
          label="נפתרו"
          value={rows.filter((row) => row.status === "resolved").length}
        />
      </div>

      {requests.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          לא ניתן לטעון את הפניות לצוות.
        </div>
      ) : null}

      <AdminFilterBar>
        <AdminSearchField
          id="support-search"
          label="חיפוש"
          placeholder="שם, אימייל, נושא או תוכן"
          value={search}
          onChange={setSearch}
        />
        <AdminSelectFilter
          id="support-status"
          label="סטטוס"
          value={statusFilter}
          onChange={setStatusFilter}
          options={Object.values(STATUS_LABELS)}
        />
        <AdminSelectFilter
          id="support-category"
          label="סוג"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={Object.values(CATEGORY_LABELS)}
        />
      </AdminFilterBar>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        getRowId={(row) => row.id}
        onRowClick={openDrawer}
        mobileRow={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
                {row.therapistName || row.accountEmail || "חשבון מטפל"}
              </span>
              <AdminStatusBadge status={STATUS_LABELS[row.status]} />
            </div>
            <p className="text-sm text-foreground">{row.subject}</p>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[row.category]} · {formatAdminDateTime(row.createdAt)}
            </p>
          </div>
        )}
        emptyTitle={requests.isLoading ? "טוען…" : "אין פניות מתאימות"}
      />

      <AdminDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        title={selected ? selected.subject : ""}
        description={
          selected
            ? `${CATEGORY_LABELS[selected.category]} · ${STATUS_LABELS[selected.status]}`
            : undefined
        }
        footer={
          selected ? (
            <div className="space-y-3">
              <label className="block">
                <Label htmlFor="support-next-status">סטטוס</Label>
                <Select
                  value={nextStatus}
                  onValueChange={(value) => setNextStatus(value as SupportStatus)}
                >
                  <SelectTrigger id="support-next-status" className="mt-1 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block">
                <Label htmlFor="support-staff-response">תגובה שתוצג למטפל/ת</Label>
                <Textarea
                  id="support-staff-response"
                  value={staffResponse}
                  onChange={(event) => setStaffResponse(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="mt-1 bg-white"
                />
              </label>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate()}
                >
                  {reviewMutation.isPending ? "שומר…" : "שמירת העדכון"}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרטי הפונה">
              <AdminDetailRow label="שם" value={selected.therapistName || "—"} />
              <AdminDetailRow
                label="אימייל חשבון"
                value={<span dir="ltr">{selected.accountEmail || "—"}</span>}
              />
              <AdminDetailRow label="נוצר" value={formatAdminDateTime(selected.createdAt)} />
              <AdminDetailRow label="עודכן" value={formatAdminDateTime(selected.updatedAt)} />
            </AdminDetailSection>
            <AdminDetailSection title="תוכן הפנייה">
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {selected.message}
              </p>
            </AdminDetailSection>
            {selected.staffResponse ? (
              <AdminDetailSection title="תגובת הצוות האחרונה">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {selected.staffResponse}
                </p>
              </AdminDetailSection>
            ) : null}
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
