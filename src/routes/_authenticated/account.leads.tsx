import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clipboard, Filter, Inbox, Mail, MessageCircle, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { ACCOUNT_MOCK_LEADS } from "@/components/account/account-mock-data";
import { ContactPreferencesPanel } from "@/components/account/contact-preferences-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  accountChannelLabel,
  accountLeadStatusLabel,
  formatAccountActivityDate,
  formatAgorot,
  shortActivityId,
} from "@/lib/account-activity";
import {
  getMyAccountLeads,
  type AccountActivityChannel,
  type AccountLeadActivity,
} from "@/lib/account-activity.functions";
import {
  getMyAccountLeadDetail,
  updateMyAccountLead,
  type AccountLeadDetail,
  type LeadWorkflowStatus,
} from "@/lib/account-lead-detail.functions";

export const Route = createFileRoute("/_authenticated/account/leads")({
  head: () => ({
    meta: [{ title: "פניות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountLeadsPage,
});

const WORKFLOW_LABELS: Record<LeadWorkflowStatus, string> = {
  new: "חדשה",
  in_progress: "בטיפול",
  handled: "טופלה",
  archived: "בארכיון",
};

type LeadDisplayRow = {
  id: string;
  displayId: string;
  date: string;
  time: string;
  channel: AccountActivityChannel;
  deliveryStatus: string;
  deliveryLabel: string;
  workflowStatus: LeadWorkflowStatus;
  chargeAgorot: number;
};

function realLeadRow(lead: AccountLeadActivity): LeadDisplayRow {
  const timestamp = formatAccountActivityDate(lead.created_at);
  return {
    id: lead.id,
    displayId: shortActivityId(lead.id, "L"),
    date: timestamp.date,
    time: timestamp.time,
    channel: lead.channel,
    deliveryStatus: lead.delivery_status,
    deliveryLabel: accountLeadStatusLabel(lead.delivery_status, lead.channel),
    workflowStatus: lead.workflow_status,
    chargeAgorot: lead.charge_agorot,
  };
}

function exampleLeadRows(): LeadDisplayRow[] {
  return ACCOUNT_MOCK_LEADS.map((lead, index) => {
    const channel: AccountActivityChannel =
      lead.channel === "WhatsApp" ? "whatsapp" : lead.channel === "טלפון" ? "phone" : "email";
    return {
      id: lead.id,
      displayId: lead.id,
      date: lead.date,
      time: lead.time,
      channel,
      deliveryStatus: lead.status === "ממתינה" ? "pending" : channel === "phone" ? "connected" : "sent",
      deliveryLabel: lead.status,
      workflowStatus: index === 0 ? "new" : index === 1 ? "in_progress" : index === 2 ? "handled" : "archived",
      chargeAgorot: lead.charge * 100,
    };
  });
}

function exampleDetail(row: LeadDisplayRow): AccountLeadDetail {
  const phoneLead = row.channel === "phone";
  return {
    id: row.id,
    created_at: "2026-08-18T15:42:00.000Z",
    channel: row.channel,
    delivery_status: row.deliveryStatus,
    workflow_status: row.workflowStatus,
    visitor_name: phoneLead ? null : "יעל לוי",
    visitor_phone: phoneLead ? null : "050-1234567",
    message: phoneLead
      ? "שיחה טלפונית שחוברה דרך טיפולינקס."
      : "שלום, אני מחפשת טיפול עבור התמודדות עם חרדה ואשמח לשוחח כדי לבדוק התאמה וזמינות.",
    problem_name: phoneLead ? null : "חרדה ומתח",
    population_name: "מבוגרים",
    private_note: row.workflowStatus === "handled" ? "נוצר קשר ונקבעה שיחת היכרות." : null,
    updated_at: null,
    charge_agorot: row.chargeAgorot,
  };
}

function AccountLeadsPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const getLeadsFn = useServerFn(getMyAccountLeads);
  const getDetailFn = useServerFn(getMyAccountLeadDetail);
  const updateLeadFn = useServerFn(updateMyAccountLead);
  const leadsQuery = useQuery({ queryKey: ["my-account-leads"], queryFn: () => getLeadsFn() });
  const [channel, setChannel] = useState("all");
  const [workflow, setWorkflow] = useState("all");
  const [query, setQuery] = useState("");
  const [showExample, setShowExample] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workflowDraft, setWorkflowDraft] = useState<LeadWorkflowStatus>("new");
  const [noteDraft, setNoteDraft] = useState("");

  const realRows = useMemo(() => (leadsQuery.data ?? []).map(realLeadRow), [leadsQuery.data]);
  const sourceRows = useMemo(() => (showExample ? exampleLeadRows() : realRows), [realRows, showExample]);
  const selectedRow = sourceRows.find((row) => row.id === selectedId) ?? null;
  const detailQuery = useQuery({
    queryKey: ["my-account-lead", selectedId],
    queryFn: () => getDetailFn({ data: { leadId: selectedId! } }),
    enabled: Boolean(selectedId && !showExample),
  });
  const selectedDetail = showExample && selectedRow ? exampleDetail(selectedRow) : detailQuery.data;

  useEffect(() => {
    if (!selectedDetail) return;
    setWorkflowDraft(selectedDetail.workflow_status);
    setNoteDraft(selectedDetail.private_note ?? "");
  }, [selectedDetail]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateLeadFn({
        data: {
          leadId: selectedId!,
          workflowStatus: workflowDraft,
          privateNote: noteDraft.trim() || null,
        },
      }),
    onSuccess: async (detail) => {
      queryClient.setQueryData(["my-account-lead", detail.id], detail);
      toast.success("הפנייה עודכנה.");
      await queryClient.invalidateQueries({ queryKey: ["my-account-leads"] });
      await queryClient.invalidateQueries({ queryKey: ["my-account-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את הפנייה."),
  });

  const leads = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();
    return sourceRows.filter((lead) => {
      const matchesChannel = channel === "all" || lead.channel === channel;
      const matchesWorkflow = workflow === "all" || lead.workflowStatus === workflow;
      const matchesQuery =
        !searchTerm ||
        `${lead.id} ${lead.displayId} ${accountChannelLabel(lead.channel)} ${lead.deliveryLabel} ${WORKFLOW_LABELS[lead.workflowStatus]} ${lead.date}`
          .toLowerCase()
          .includes(searchTerm);
      return matchesChannel && matchesWorkflow && matchesQuery;
    });
  }, [channel, query, sourceRows, workflow]);

  function closeDetail() {
    setSelectedId(null);
    setWorkflowDraft("new");
    setNoteDraft("");
  }

  function leaveExampleMode() {
    closeDetail();
    setShowExample(false);
  }

  return (
    <>
      <AccountPageHeader
        eyebrow="ניהול פניות"
        title="פניות"
        description="הגדירו כיצד לקבל פניות, פתחו את פרטי הפנייה ועדכנו את מצב הטיפול בה."
        action={
          showExample ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-100">
              תצוגת דוגמה
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-brand-soft text-brand hover:bg-brand-soft">
              {realRows.length.toLocaleString("he-IL")} פניות
            </Badge>
          )
        }
      />

      <ContactPreferencesPanel defaultEmail={user.email ?? ""} />

      {showExample && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span>הנתונים הבאים נועדו להמחשה בלבד ואינם נשמרים בחשבון.</span>
          <Button type="button" variant="outline" size="sm" onClick={leaveExampleMode}>
            חזרה לנתונים שלי
          </Button>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface-elevated shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לפי מזהה, תאריך או סטטוס"
              className="pr-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-[155px] bg-white">
                <SelectValue placeholder="כל הערוצים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הערוצים</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="phone">טלפון</SelectItem>
                <SelectItem value="email">אימייל</SelectItem>
                <SelectItem value="other">ערוץ אחר</SelectItem>
              </SelectContent>
            </Select>
            <Select value={workflow} onValueChange={setWorkflow}>
              <SelectTrigger className="w-[155px] bg-white">
                <SelectValue placeholder="כל המצבים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המצבים</SelectItem>
                {Object.entries(WORKFLOW_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {leadsQuery.isLoading && !showExample ? (
          <div className="p-8 text-center text-sm text-muted-foreground">טוען את הפניות…</div>
        ) : leadsQuery.isError && !showExample ? (
          <div className="p-8 text-center">
            <p className="text-sm text-destructive">לא הצלחנו לטעון את הפניות.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void leadsQuery.refetch()}
            >
              ניסיון חוזר
            </Button>
          </div>
        ) : realRows.length === 0 && !showExample ? (
          <EmptyLeadsState onShowExample={() => setShowExample(true)} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">מזהה</th>
                    <th className="px-4 py-3 text-right font-medium">תאריך ושעה</th>
                    <th className="px-4 py-3 text-right font-medium">ערוץ</th>
                    <th className="px-4 py-3 text-right font-medium">מסירה</th>
                    <th className="px-4 py-3 text-right font-medium">טיפול</th>
                    <th className="px-4 py-3 text-right font-medium">חיוב</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(lead.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedId(lead.id);
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/20 focus:bg-muted/20 focus:outline-none"
                    >
                      <td className="px-4 py-4 font-medium text-foreground ltr-num">{lead.displayId}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {lead.date} · {lead.time}
                      </td>
                      <td className="px-4 py-4">
                        <ChannelLabel channel={lead.channel} />
                      </td>
                      <td className="px-4 py-4">
                        <DeliveryBadge status={lead.deliveryStatus} label={lead.deliveryLabel} />
                      </td>
                      <td className="px-4 py-4">
                        <WorkflowBadge status={lead.workflowStatus} />
                      </td>
                      <td className="px-4 py-4 font-semibold text-foreground ltr-num">
                        {lead.chargeAgorot ? formatAgorot(lead.chargeAgorot) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border/70 md:hidden">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className="block w-full p-4 text-right"
                  onClick={() => setSelectedId(lead.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground ltr-num">{lead.displayId}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lead.date} · {lead.time}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground ltr-num">
                      {lead.chargeAgorot ? formatAgorot(lead.chargeAgorot) : "—"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ChannelLabel channel={lead.channel} />
                    <DeliveryBadge status={lead.deliveryStatus} label={lead.deliveryLabel} />
                    <WorkflowBadge status={lead.workflowStatus} />
                  </div>
                </button>
              ))}
            </div>

            {leads.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">לא נמצאו פניות התואמות לסינון.</div>
            )}
          </>
        )}
      </div>

      <LeadDetailDrawer
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        displayId={selectedRow?.displayId ?? ""}
        detail={selectedDetail}
        loading={Boolean(selectedId && !showExample && detailQuery.isLoading)}
        error={Boolean(selectedId && !showExample && detailQuery.isError)}
        onRetry={() => void detailQuery.refetch()}
        workflow={workflowDraft}
        note={noteDraft}
        onWorkflowChange={setWorkflowDraft}
        onNoteChange={setNoteDraft}
        saving={updateMutation.isPending}
        readOnly={showExample}
        onSave={() => updateMutation.mutate()}
      />
    </>
  );
}

function EmptyLeadsState({ onShowExample }: { onShowExample: () => void }) {
  return (
    <div className="p-8 text-center sm:p-12">
      <Inbox className="mx-auto h-9 w-9 text-brand" />
      <h2 className="mt-3 text-base font-semibold text-foreground">עדיין לא התקבלו פניות</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        פניות חדשות יופיעו כאן. ניתן יהיה לפתוח כל פנייה, לצפות בפרטים ולעדכן את מצב הטיפול.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onShowExample}>
        הצגת דוגמה
      </Button>
    </div>
  );
}

function LeadDetailDrawer({
  open,
  onOpenChange,
  displayId,
  detail,
  loading,
  error,
  onRetry,
  workflow,
  note,
  onWorkflowChange,
  onNoteChange,
  saving,
  readOnly,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayId: string;
  detail: AccountLeadDetail | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  workflow: LeadWorkflowStatus;
  note: string;
  onWorkflowChange: (value: LeadWorkflowStatus) => void;
  onNoteChange: (value: string) => void;
  saving: boolean;
  readOnly: boolean;
  onSave: () => void;
}) {
  const timestamp = detail ? formatAccountActivityDate(detail.created_at) : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col gap-0 overflow-y-auto p-0" dir="rtl">
        <SheetHeader className="border-b border-border p-4 text-start">
          <SheetTitle>פרטי פנייה {displayId}</SheetTitle>
          <SheetDescription>
            {readOnly ? "תצוגת דוגמה — השינויים אינם נשמרים" : "הפרטים זמינים רק לבעל/ת החשבון"}
          </SheetDescription>
        </SheetHeader>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">טוען את פרטי הפנייה…</div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-destructive">לא הצלחנו לטעון את פרטי הפנייה.</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              ניסיון חוזר
            </Button>
          </div>
        ) : detail ? (
          <div className="flex flex-1 flex-col">
            <div className="flex-1 space-y-5 p-4">
              <section className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {detail.visitor_name || accountChannelLabel(detail.channel)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {timestamp ? `${timestamp.date} · ${timestamp.time}` : "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DeliveryBadge
                      status={detail.delivery_status}
                      label={accountLeadStatusLabel(detail.delivery_status, detail.channel)}
                    />
                    <WorkflowBadge status={detail.workflow_status} />
                  </div>
                </div>
                {detail.visitor_phone ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm">
                      <a href={`tel:${detail.visitor_phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="h-4 w-4" />
                        חיוג לפונה
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(detail.visitor_phone!)
                          .then(() => toast.success("המספר הועתק."));
                      }}
                    >
                      <Clipboard className="h-4 w-4" />
                      העתקת מספר
                    </Button>
                    <span dir="ltr" className="text-sm font-medium text-foreground">
                      {detail.visitor_phone}
                    </span>
                  </div>
                ) : null}
              </section>

              {(detail.problem_name || detail.population_name) && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">הקשר הפנייה</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.problem_name ? <Badge variant="secondary">{detail.problem_name}</Badge> : null}
                    {detail.population_name ? <Badge variant="secondary">{detail.population_name}</Badge> : null}
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">הודעה</h3>
                <p className="whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6 text-foreground">
                  {detail.message}
                </p>
              </section>

              <section className="space-y-4 rounded-xl border border-brand/20 bg-brand-soft/20 p-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-foreground">מצב טיפול</span>
                  <Select
                    value={workflow}
                    onValueChange={(value) => onWorkflowChange(value as LeadWorkflowStatus)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(WORKFLOW_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-foreground">הערה פרטית</span>
                  <Textarea
                    value={note}
                    onChange={(event) => onNoteChange(event.target.value)}
                    maxLength={2000}
                    rows={4}
                    disabled={readOnly}
                    placeholder="לדוגמה: נוצר קשר ונקבעה שיחת היכרות"
                    className="resize-y bg-white"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">ההערה מוצגת רק בחשבון שלך.</span>
                </label>
              </section>
            </div>
            {!readOnly ? (
              <div className="sticky bottom-0 border-t border-border bg-surface-elevated p-4">
                <Button type="button" disabled={saving} onClick={onSave}>
                  {saving ? "שומר…" : "שמירת עדכון"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ChannelLabel({ channel }: { channel: AccountActivityChannel }) {
  const Icon = channel === "whatsapp" ? MessageCircle : channel === "phone" ? Phone : Mail;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <Icon className="h-4 w-4 text-brand" />
      {accountChannelLabel(channel)}
    </span>
  );
}

function DeliveryBadge({ status, label }: { status: string; label: string }) {
  const cls =
    status === "pending" || status === "awaiting_consent"
      ? "bg-amber-100 text-amber-900"
      : status === "failed" || status === "cancelled_after_opt_out" || status === "expired_before_consent"
        ? "bg-red-100 text-red-900"
        : "bg-emerald-100 text-emerald-900";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function WorkflowBadge({ status }: { status: LeadWorkflowStatus }) {
  const cls =
    status === "new"
      ? "bg-sky-100 text-sky-900"
      : status === "in_progress"
        ? "bg-amber-100 text-amber-900"
        : status === "handled"
          ? "bg-emerald-100 text-emerald-900"
          : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{WORKFLOW_LABELS[status]}</span>;
}
