import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, MailPlus, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDate } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import {
  importAdminRecruitmentCsv,
  listAdminRecruitmentInvitations,
  previewAdminRecruitmentCsv,
  type AdminRecruitmentInvitationRow,
  type AdminRecruitmentPreview,
  type AdminRecruitmentPreviewRow,
  type RecruitmentInvitationStatus,
  type RecruitmentPreviewStatus,
} from "@/lib/admin-recruitment.functions";

export const Route = createFileRoute("/admin/recruitment")({
  head: () => ({
    meta: [
      { title: "הזמנות מטפלים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "ייבוא וניהול הזמנות הצטרפות למטפלים" },
    ],
  }),
  component: RecruitmentPage,
});

const PREVIEW_LABELS: Record<RecruitmentPreviewStatus, string> = {
  eligible: "מוכנה לייבוא",
  invalid_email: "אימייל לא תקין",
  duplicate_file: "כפילות בקובץ",
  already_invited: "כבר קיימת הזמנה",
  already_registered: "כבר רשום/ה",
  existing_profile: "כבר קיים פרופיל",
  suppressed: "חסום/ה להזמנות",
};

const INVITATION_LABELS: Record<RecruitmentInvitationStatus, string> = {
  ready: "מוכנה לשליחה",
  submitting: "בתהליך שליחה",
  submitted: "נמסרה לספק",
  delivered: "נמסרה",
  bounced: "חזרה",
  declined: "סירוב",
  registered: "נרשם/ה",
  submission_failed: "שליחה לא התקבלה",
  submission_unknown: "מצב שליחה לא ידוע",
};

function RecruitmentPage() {
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewAdminRecruitmentCsv);
  const importFn = useServerFn(importAdminRecruitmentCsv);
  const listFn = useServerFn(listAdminRecruitmentInvitations);

  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<AdminRecruitmentPreview | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [channel, setChannel] = useState("all");
  const [sortKey, setSortKey] = useState<"createdAt" | "destination" | "status" | "channel">("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, status, channel, pageSize]);

  const invitations = useQuery({
    queryKey: ["admin-recruitment", page, pageSize, debouncedSearch, status, channel, sortKey, sortDirection],
    queryFn: () =>
      listFn({
        data: {
          page,
          pageSize: pageSize as 10 | 25 | 50 | 100,
          search: debouncedSearch,
          status: status === "all" ? null : (status as RecruitmentInvitationStatus),
          channel: channel === "all" ? null : (channel as "email" | "sms" | "whatsapp"),
          sortKey,
          sortDirection,
        },
      }),
  });

  useEffect(() => {
    if (invitations.data && page > invitations.data.pageCount) setPage(invitations.data.pageCount);
  }, [invitations.data, page]);

  const previewMutation = useMutation({
    mutationFn: () => previewFn({ data: { csvText, fileName } }),
    onSuccess: (result) => setPreview(result),
    onError: (error: Error) => {
      setPreview(null);
      toast.error(error.message || "לא ניתן לבדוק את קובץ ה-CSV.");
    },
  });

  const importMutation = useMutation({
    mutationFn: () => importFn({ data: { csvText, fileName } }),
    onSuccess: async (result) => {
      toast.success(
        result.importedCount > 0
          ? `${result.importedCount} כתובות נוספו למאגר ההזמנות. לא נשלחה עדיין אף הודעה.`
          : "לא נמצאו כתובות חדשות לייבוא.",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-recruitment"] });
      const refreshed = await previewFn({ data: { csvText, fileName } });
      setPreview(refreshed);
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לייבא את הרשימה."),
  });

  async function handleFile(file: File | undefined) {
    setPreview(null);
    if (!file) {
      setFileName("");
      setCsvText("");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileName("");
      setCsvText("");
      toast.error("יש לבחור קובץ CSV.");
      return;
    }
    try {
      const text = await file.text();
      setFileName(file.name);
      setCsvText(text);
    } catch {
      toast.error("לא ניתן לקרוא את הקובץ.");
    }
  }

  function handleSortChange(key: string) {
    const nextKey = key as typeof sortKey;
    if (nextKey === sortKey) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
    setPage(1);
  }

  const previewColumns: AdminColumn<AdminRecruitmentPreviewRow>[] = useMemo(
    () => [
      { key: "row", header: "שורה", render: (row) => <span dir="ltr">{row.rowNumber}</span> },
      {
        key: "email",
        header: "אימייל",
        render: (row) => <span dir="ltr" className="break-all">{row.email || "—"}</span>,
      },
      {
        key: "name",
        header: "שם",
        render: (row) => [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
      },
      {
        key: "status",
        header: "תוצאה",
        render: (row) => <AdminStatusBadge status={PREVIEW_LABELS[row.status]} />,
      },
    ],
    [],
  );

  const invitationColumns: AdminColumn<AdminRecruitmentInvitationRow>[] = [
    {
      key: "destination",
      header: "יעד",
      sortable: true,
      render: (row) => <span dir="ltr" className="break-all">{row.destination}</span>,
    },
    {
      key: "name",
      header: "שם",
      render: (row) => [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
    },
    {
      key: "channel",
      header: "ערוץ",
      sortable: true,
      render: (row) => (row.channel === "email" ? "אימייל" : row.channel === "sms" ? "SMS" : "WhatsApp"),
    },
    {
      key: "status",
      header: "סטטוס",
      sortable: true,
      render: (row) => <AdminStatusBadge status={INVITATION_LABELS[row.status]} />,
    },
    {
      key: "createdAt",
      header: "תאריך ייבוא",
      sortable: true,
      render: (row) => <span dir="ltr">{formatAdminDate(row.createdAt)}</span>,
    },
  ];

  const listRows = invitations.data?.rows ?? [];
  const readyCount = listRows.filter((row) => row.status === "ready").length;

  return (
    <div>
      <AdminPageHeader
        title="הזמנות מטפלים"
        subtitle="ייבוא רשימות והכנת הזמנות הצטרפות. בשלב זה המערכת אינה שולחת הודעות בפועל."
        breadcrumb="הזמנות מטפלים"
      />

      <div className="mb-5 rounded-lg border border-border bg-surface-elevated p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              ייבוא קובץ CSV
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              עמודת <span dir="ltr" className="font-mono">email</span> היא חובה. אפשר להוסיף
              <span dir="ltr" className="mx-1 font-mono">first_name</span> ו-
              <span dir="ltr" className="font-mono">last_name</span>. המודל כבר מוכן לערוצי טלפון עתידיים,
              אך בשלב זה לא מיובאים ולא נשמרים מספרי טלפון.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            בחירת CSV
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
        </div>

        {fileName ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-secondary/30 p-3 text-sm">
            <span>נבחר: <strong dir="ltr">{fileName}</strong></span>
            <Button
              size="sm"
              onClick={() => previewMutation.mutate()}
              disabled={!csvText || previewMutation.isPending || importMutation.isPending}
            >
              {previewMutation.isPending ? "בודק…" : "בדיקת הרשימה"}
            </Button>
          </div>
        ) : null}
      </div>

      {preview ? (
        <section className="mb-6">
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatCard label="סה״כ בקובץ" value={preview.summary.total} />
            <AdminStatCard label="מוכנות לייבוא" value={preview.summary.eligible} />
            <AdminStatCard
              label="כבר קיימות"
              value={preview.summary.alreadyInvited + preview.summary.alreadyRegistered + preview.summary.existingProfile}
              hint="הזמנה, חשבון או פרופיל קיימים"
            />
            <AdminStatCard
              label="לא ייובאו"
              value={preview.summary.invalid + preview.summary.duplicateFile + preview.summary.suppressed}
              hint="שגיאות, כפילויות או חסימות"
            />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">תצוגה מקדימה</h2>
              <p className="text-xs text-muted-foreground">
                הייבוא אינו שולח הודעות. כתובת שכבר קיימת במאגר הזמנות לא תיווצר שוב.
              </p>
            </div>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={preview.summary.eligible === 0 || importMutation.isPending || previewMutation.isPending}
            >
              <MailPlus className="me-2 h-4 w-4" aria-hidden="true" />
              {importMutation.isPending ? "מייבא…" : `ייבוא ${preview.summary.eligible} כתובות`}
            </Button>
          </div>

          <AdminDataTable
            columns={previewColumns}
            rows={preview.rows}
            getRowId={(row) => `${row.rowNumber}-${row.normalizedEmail ?? row.email}`}
            emptyTitle="אין רשומות בקובץ"
          />
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">מאגר ההזמנות</h2>
            <p className="text-xs text-muted-foreground">
              הרשומות כאן הן תשתית ההזמנה. בשלב הבא נחבר שליחה דרך Brevo ונעדכן סטטוסים באמצעות callbacks/webhooks.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {invitations.isLoading ? "טוען…" : `${invitations.data?.total ?? 0} יעדים · ${readyCount} מוכנים בעמוד הנוכחי`}
          </span>
        </div>

        <AdminFilterBar>
          <AdminSearchField
            id="recruitment-search"
            label="חיפוש"
            placeholder="אימייל או שם"
            value={search}
            onChange={setSearch}
          />
          <AdminSelectFilter
            id="recruitment-channel"
            label="ערוץ"
            value={channel}
            onChange={setChannel}
            options={[
              { value: "email", label: "אימייל" },
              { value: "sms", label: "SMS" },
              { value: "whatsapp", label: "WhatsApp" },
            ]}
          />
          <AdminSelectFilter
            id="recruitment-status"
            label="סטטוס"
            value={status}
            onChange={setStatus}
            options={Object.entries(INVITATION_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </AdminFilterBar>

        {invitations.isError ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            לא ניתן לטעון את מאגר ההזמנות.
          </div>
        ) : null}

        <AdminDataTable
          columns={invitationColumns}
          rows={listRows}
          getRowId={(row) => row.id}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          pagination={
            invitations.data
              ? {
                  page,
                  pageCount: invitations.data.pageCount,
                  pageSize,
                  total: invitations.data.total,
                  onPageChange: setPage,
                  onPageSizeChange: (value) => setPageSize(value),
                  pageSizeOptions: [10, 25, 50, 100],
                  showPageNumbers: true,
                }
              : undefined
          }
          mobileRow={(row) => (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span dir="ltr" className="break-all font-medium">{row.destination}</span>
                <AdminStatusBadge status={INVITATION_LABELS[row.status]} />
              </div>
              <p className="text-xs text-muted-foreground">
                {row.channel === "email" ? "אימייל" : row.channel === "sms" ? "SMS" : "WhatsApp"} · יובא {formatAdminDate(row.createdAt)}
              </p>
            </div>
          )}
          emptyTitle={invitations.isLoading ? "טוען…" : "אין הזמנות מתאימות"}
        />
      </section>
    </div>
  );
}
