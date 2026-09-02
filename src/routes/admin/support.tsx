import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mail, RefreshCw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminDetailDrawer, AdminDetailRow, AdminDetailSection } from "@/components/admin/admin-detail-drawer";
import { AdminFilterBar, AdminSearchField, AdminSelectFilter } from "@/components/admin/admin-filter-bar";
import { formatAdminDateTime } from "@/components/admin/admin-formatters";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminSupportConversation,
  listAdminSupportRequests,
  replyAdminSupportRequest,
  syncAdminSupportMailbox,
  updateAdminSupportStatus,
  type AdminSupportMessage,
  type AdminSupportRequest,
  type SupportStatus,
} from "@/lib/admin-support.functions";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "פניות לצוות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "תיבת התמיכה המאוחדת של צוות טיפולינקס" },
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

const SOURCE_LABELS: Record<AdminSupportRequest["source"], string> = {
  site: "מהאתר",
  email: "אימייל",
};

function AdminSupportPage() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdminSupportRequests);
  const conversationFn = useServerFn(getAdminSupportConversation);
  const statusFn = useServerFn(updateAdminSupportStatus);
  const replyFn = useServerFn(replyAdminSupportRequest);
  const syncFn = useServerFn(syncAdminSupportMailbox);

  const requests = useQuery({
    queryKey: ["admin-support-requests"],
    queryFn: () => listFn(),
    refetchOnWindowFocus: true,
  });
  const mailboxSync = useQuery({
    queryKey: ["admin-support-mailbox-sync"],
    queryFn: () => syncFn(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  useEffect(() => {
    if (!mailboxSync.dataUpdatedAt) return;
    void queryClient.invalidateQueries({ queryKey: ["admin-support-requests"] });
    if (mailboxSync.data?.imported) {
      toast.success(
        mailboxSync.data.imported === 1
          ? "אימייל חדש נוסף לפניות לצוות."
          : `${mailboxSync.data.imported} אימיילים חדשים נוספו לפניות לצוות.`,
      );
    }
  }, [mailboxSync.data?.imported, mailboxSync.dataUpdatedAt, queryClient]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<SupportStatus>("in_review");
  const [replyText, setReplyText] = useState("");

  const selected = (requests.data ?? []).find((request) => request.id === selectedId) ?? null;
  const conversation = useQuery({
    queryKey: ["admin-support-conversation", selectedId],
    queryFn: () => conversationFn({ data: { requestId: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("he");
    return (requests.data ?? []).filter((request) => {
      if (term) {
        const haystack = [
          request.therapistName ?? "",
          request.requesterName ?? "",
          request.accountEmail ?? "",
          request.requesterEmail ?? "",
          request.subject,
          request.message,
          request.ticketCode,
        ]
          .join(" ")
          .toLocaleLowerCase("he");
        if (!haystack.includes(term)) return false;
      }
      if (statusFilter !== "all" && STATUS_LABELS[request.status] !== statusFilter) return false;
      if (categoryFilter !== "all" && CATEGORY_LABELS[request.category] !== categoryFilter) return false;
      if (sourceFilter !== "all" && SOURCE_LABELS[request.source] !== sourceFilter) return false;
      return true;
    });
  }, [categoryFilter, requests.data, search, sourceFilter, statusFilter]);

  const statusMutation = useMutation({
    mutationFn: () => statusFn({ data: { requestId: selected!.id, status: nextStatus } }),
    onSuccess: async () => {
      toast.success("סטטוס הפנייה עודכן.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-support-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-support-conversation", selectedId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את הפנייה."),
  });

  const replyMutation = useMutation({
    mutationFn: () => replyFn({ data: { requestId: selected!.id, message: replyText } }),
    onSuccess: async () => {
      setReplyText("");
      toast.success("התשובה נשלחה מ-admin@tipulinks.co.il.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-support-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-support-conversation", selectedId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח את התשובה."),
  });

  function openDrawer(request: AdminSupportRequest) {
    setSelectedId(request.id);
    setNextStatus(request.status === "new" ? "in_review" : request.status);
    setReplyText("");
  }

  function closeDrawer() {
    setSelectedId(null);
    setNextStatus("in_review");
    setReplyText("");
  }

  const rows = requests.data ?? [];
  const columns: AdminColumn<AdminSupportRequest>[] = [
    {
      key: "requester",
      header: "פונה",
      render: (row) => (
        <span className="font-medium">
          {row.therapistName || row.requesterName || row.requesterEmail || row.accountEmail || "פונה חיצוני"}
        </span>
      ),
    },
    { key: "source", header: "מקור", render: (row) => SOURCE_LABELS[row.source] },
    { key: "subject", header: "נושא", render: (row) => row.subject },
    {
      key: "lastMessageAt",
      header: "פעילות אחרונה",
      hideOnNarrow: true,
      render: (row) => <span dir="ltr">{formatAdminDateTime(row.lastMessageAt)}</span>,
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
          פתיחה
        </Button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="פניות לצוות"
        subtitle={requests.isLoading ? "טוען פניות…" : `${rows.length} שיחות תמיכה`}
        breadcrumb="פניות לצוות"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated p-3 text-sm">
        <div>
          <p className="font-medium text-foreground">תיבת התמיכה מסונכרנת עם admin@tipulinks.co.il</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            אימיילים חדשים נבדקים בפתיחת המסך ובכל דקה כשהמסך פתוח.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={mailboxSync.isFetching}
          onClick={() => void mailboxSync.refetch()}
        >
          <RefreshCw className={`h-4 w-4 ${mailboxSync.isFetching ? "animate-spin" : ""}`} />
          {mailboxSync.isFetching ? "מסנכרן…" : "סנכרון עכשיו"}
        </Button>
      </div>

      {mailboxSync.isError ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          לא ניתן לסנכרן כרגע את Zoho Mail. הפניות שכבר נשמרו בטיפולינקס עדיין זמינות לניהול.
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <AdminStatCard label="חדשות" value={rows.filter((row) => row.status === "new").length} />
        <AdminStatCard label="בטיפול" value={rows.filter((row) => row.status === "in_review").length} />
        <AdminStatCard
          label="נפתרו/נסגרו"
          value={rows.filter((row) => row.status === "resolved" || row.status === "closed").length}
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
          placeholder="שם, אימייל, נושא או מספר פנייה"
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
        <AdminSelectFilter
          id="support-source"
          label="מקור"
          value={sourceFilter}
          onChange={setSourceFilter}
          options={Object.values(SOURCE_LABELS)}
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
                {row.therapistName || row.requesterName || row.requesterEmail || row.accountEmail || "פונה חיצוני"}
              </span>
              <AdminStatusBadge status={STATUS_LABELS[row.status]} />
            </div>
            <p className="text-sm text-foreground">{row.subject}</p>
            <p className="text-xs text-muted-foreground">
              {SOURCE_LABELS[row.source]} · {CATEGORY_LABELS[row.category]} · {formatAdminDateTime(row.lastMessageAt)}
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
            ? `${SOURCE_LABELS[selected.source]} · ${STATUS_LABELS[selected.status]} · TL-${selected.ticketCode}`
            : undefined
        }
        footer={
          selected ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="support-reply">תשובה באימייל</Label>
                <Textarea
                  id="support-reply"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  maxLength={5000}
                  rows={5}
                  className="mt-1 bg-white"
                  placeholder="התשובה תישלח מ-admin@tipulinks.co.il"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    disabled={replyMutation.isPending || !replyText.trim()}
                    onClick={() => replyMutation.mutate()}
                  >
                    {replyMutation.isPending ? (
                      <Mail className="h-4 w-4 animate-pulse" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {replyMutation.isPending ? "שולח…" : "שליחת תשובה"}
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <Label htmlFor="support-next-status">סטטוס</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Select value={nextStatus} onValueChange={(value) => setNextStatus(value as SupportStatus)}>
                    <SelectTrigger id="support-next-status" className="bg-white">
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate()}
                  >
                    {statusMutation.isPending ? "שומר…" : "שמירה"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <AdminDetailSection title="פרטי הפונה">
              <AdminDetailRow label="שם" value={selected.therapistName || selected.requesterName || "—"} />
              <AdminDetailRow
                label="אימייל"
                value={<span dir="ltr">{selected.requesterEmail || selected.accountEmail || "—"}</span>}
              />
              <AdminDetailRow label="מקור" value={SOURCE_LABELS[selected.source]} />
              <AdminDetailRow label="סוג" value={CATEGORY_LABELS[selected.category]} />
              <AdminDetailRow label="נוצר" value={formatAdminDateTime(selected.createdAt)} />
              <AdminDetailRow label="פעילות אחרונה" value={formatAdminDateTime(selected.lastMessageAt)} />
            </AdminDetailSection>

            <AdminDetailSection title="התכתבות">
              {conversation.isLoading ? <p className="text-sm text-muted-foreground">טוען את ההתכתבות…</p> : null}
              {conversation.isError ? <p className="text-sm text-destructive">לא ניתן לטעון את ההתכתבות.</p> : null}
              {conversation.data ? <SupportConversation messages={conversation.data.messages} /> : null}
            </AdminDetailSection>
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}

function SupportConversation({ messages }: { messages: AdminSupportMessage[] }) {
  if (!messages.length) return <p className="text-sm text-muted-foreground">אין הודעות להצגה.</p>;
  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const outgoing = message.direction === "outgoing";
        return (
          <div
            key={message.id}
            className={`rounded-xl border p-3 ${outgoing ? "mr-6 border-brand/20 bg-brand-soft/30" : "ml-6 border-border bg-surface"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {outgoing
                  ? "צוות טיפולינקס"
                  : message.senderName ||
                    message.senderEmail ||
                    (message.channel === "site" ? "פנייה מהאתר" : "שולח חיצוני")}
              </span>
              <span>{formatAdminDateTime(message.occurredAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{message.body}</p>
            {message.hasAttachment ? (
              <p className="mt-2 text-xs font-medium text-amber-800">ההודעה כוללת קובץ מצורף שנשמר ב-Zoho Mail.</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
