import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, KeyRound, LifeBuoy, Palette, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getMySupportRequests, submitMySupportRequest, type MySupportRequest } from "@/lib/account-support.functions";
import { getDisplayPreferences, saveDisplayPreferences, type DisplayPreferences } from "@/lib/display-preferences";
import { deleteMyAccountPermanently, settleAndDeleteMyAccountPermanently } from "@/lib/therapist-profile.functions";

export const Route = createFileRoute("/_authenticated/account/settings")({
  head: () => ({
    meta: [{ title: "הגדרות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountSettingsPage,
});

type SupportCategory = "bug" | "complaint" | "suggestion" | "other";

type AccountDeletionState = {
  deleted: false;
  request_id: string;
  status:
    | "blocked_pending_leads"
    | "payment_method_required"
    | "payment_required"
    | "payment_processing"
    | "payment_failed"
    | "ready_to_delete";
  outstanding_agorot: number;
  pending_reservations: number;
  profile_frozen: true;
  support_email: string;
};

function loginProviders(user: { app_metadata?: Record<string, unknown>; identities?: { provider?: string }[] | null }) {
  const providers = new Set<string>();
  const primaryProvider = user.app_metadata?.provider;
  const metadataProviders = user.app_metadata?.providers;
  if (typeof primaryProvider === "string") providers.add(primaryProvider);
  if (Array.isArray(metadataProviders)) {
    metadataProviders.forEach((provider) => {
      if (typeof provider === "string") providers.add(provider);
    });
  }
  user.identities?.forEach((identity) => {
    if (identity.provider) providers.add(identity.provider);
  });
  return providers;
}

function externalProviderLabel(providers: Set<string>) {
  const labels = [...providers]
    .filter((provider) => provider !== "email")
    .map((provider) => (provider === "google" ? "Google" : provider === "apple" ? "Apple" : provider));
  return labels.length ? labels.join(" או ") : "ספק ההתחברות החיצוני";
}

function AccountSettingsPage() {
  const { user } = Route.useRouteContext();
  const providers = loginProviders(user);
  const hasPasswordLogin = providers.has("email");
  const socialProvider = externalProviderLabel(providers);
  const queryClient = useQueryClient();
  const deleteAccountFn = useServerFn(deleteMyAccountPermanently);
  const settleDeleteAccountFn = useServerFn(settleAndDeleteMyAccountPermanently);
  const submitSupportFn = useServerFn(submitMySupportRequest);
  const getSupportRequestsFn = useServerFn(getMySupportRequests);
  const [loginEmail, setLoginEmail] = useState(user.email ?? "");
  const [loginEmailRequestSent, setLoginEmailRequestSent] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [displayPreferences, setDisplayPreferences] = useState<DisplayPreferences>(() => getDisplayPreferences());
  const [supportCategory, setSupportCategory] = useState<SupportCategory>("bug");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [accountDeletionState, setAccountDeletionState] = useState<AccountDeletionState | null>(null);
  const [accountDeletionError, setAccountDeletionError] = useState<string | null>(null);
  const supportRequestsQuery = useQuery({
    queryKey: ["my-support-requests"],
    queryFn: () => getSupportRequestsFn(),
  });

  const loginEmailMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ email: loginEmail.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setLoginEmailRequestSent(true);
      toast.success("בקשת שינוי האימייל נשלחה. השלימו את האימות לפי ההודעות שיישלחו אליכם.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את אימייל ההתחברות."),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (!hasPasswordLogin || !user.email) {
        throw new Error("שינוי סיסמה זמין רק לחשבון עם התחברות באמצעות אימייל וסיסמה.");
      }
      if (!currentPassword) throw new Error("נא להזין את הסיסמה הנוכחית.");
      if (password.length < 8) throw new Error("הסיסמה צריכה להכיל לפחות 8 תווים.");
      if (password !== passwordConfirmation) throw new Error("הסיסמאות אינן זהות.");
      if (password === currentPassword) throw new Error("הסיסמה החדשה צריכה להיות שונה מהסיסמה הנוכחית.");

      const { data: reauthenticated, error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        if (signInError.code === "invalid_credentials") throw new Error("הסיסמה הנוכחית אינה נכונה.");
        throw signInError;
      }
      if (reauthenticated.user.id !== user.id) throw new Error("לא ניתן לאמת את החשבון הנוכחי.");

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirmation("");
      toast.success("הסיסמה עודכנה בהצלחה.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את הסיסמה."),
  });

  const supportMutation = useMutation({
    mutationFn: () =>
      submitSupportFn({
        data: { category: supportCategory, subject: supportSubject, message: supportMessage },
      }),
    onSuccess: async () => {
      setSupportSubject("");
      setSupportMessage("");
      toast.success("הפנייה נשלחה לצוות טיפולינקס.");
      await queryClient.invalidateQueries({ queryKey: ["my-support-requests"] });
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח את הפנייה."),
  });

  async function finishDeletedAccount() {
    queryClient.clear();
    await supabase.auth.signOut({ scope: "local" });
    window.location.assign("/");
  }

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccountFn({ data: { confirmation: "מחיקת החשבון לצמיתות" } }),
    onSuccess: async (result) => {
      setAccountDeletionError(null);
      if (result.deleted) {
        await finishDeletedAccount();
        return;
      }
      setAccountDeletionState(result as AccountDeletionState);
    },
    onError: (error: Error) => {
      const message = error.message || "לא ניתן להתחיל את מחיקת החשבון.";
      setAccountDeletionError(message);
      toast.error(message);
    },
  });

  const settleDeleteAccountMutation = useMutation({
    mutationFn: () => {
      if (!accountDeletionState?.request_id) throw new Error("בקשת המחיקה אינה זמינה. יש לנסות שוב.");
      return settleDeleteAccountFn({
        data: {
          confirmation: "מחיקת החשבון לצמיתות",
          requestId: accountDeletionState.request_id,
        },
      });
    },
    onSuccess: async (result) => {
      setAccountDeletionError(null);
      if (result.deleted) {
        await finishDeletedAccount();
        return;
      }
      setAccountDeletionState(result as AccountDeletionState);
    },
    onError: (error: Error) => {
      const message = error.message || "לא ניתן להשלים את החיוב ואת מחיקת החשבון.";
      setAccountDeletionError(message);
      toast.error(message);
    },
  });

  const normalizedLoginEmail = loginEmail.trim().toLowerCase();
  const currentLoginEmail = (user.email ?? "").trim().toLowerCase();
  const canUpdateLoginEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedLoginEmail) &&
    normalizedLoginEmail !== currentLoginEmail &&
    !loginEmailMutation.isPending;
  const canUpdatePassword =
    hasPasswordLogin &&
    currentPassword.length > 0 &&
    password.length >= 8 &&
    password === passwordConfirmation &&
    password !== currentPassword &&
    !passwordMutation.isPending;
  const canSubmitSupport =
    supportSubject.trim().length >= 3 && supportMessage.trim().length >= 10 && !supportMutation.isPending;

  function updateDisplayPreference<K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) {
    const next = { ...displayPreferences, [key]: value };
    setDisplayPreferences(next);
    saveDisplayPreferences(next);
  }

  return (
    <>
      <AccountPageHeader
        eyebrow="העדפות חשבון"
        title="הגדרות"
        description="ניהול פרטי ההתחברות, אבטחת החשבון, התצוגה והפנייה לצוות טיפולינקס."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AccountSectionCard title="פרטי החשבון" description="כתובת האימייל המשמשת להתחברות לטיפולינקס.">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">כתובת אימייל של החשבון</span>
              <Input
                value={loginEmail}
                onChange={(event) => {
                  setLoginEmail(event.target.value);
                  setLoginEmailRequestSent(false);
                }}
                type="email"
                autoComplete="email"
                dir="ltr"
                className="bg-white text-left"
                disabled={loginEmailMutation.isPending}
              />
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                שינוי הכתובת דורש אימות, ואינו משנה את האימייל המקצועי לקבלת פניות.
              </p>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!canUpdateLoginEmail}
              onClick={() => loginEmailMutation.mutate()}
            >
              {loginEmailMutation.isPending ? "שולח בקשת אימות…" : "החלפת אימייל ההתחברות"}
            </Button>
            {loginEmailRequestSent && (
              <p className="rounded-xl border border-brand/20 bg-brand-soft/40 p-3 text-xs leading-5 text-muted-foreground">
                השינוי יושלם רק לאחר האימות הנדרש. עד אז, המשיכו להשתמש בכתובת הקיימת.
              </p>
            )}
          </div>
        </AccountSectionCard>

        {hasPasswordLogin ? (
          <AccountSectionCard title="שינוי סיסמה" description="לאבטחת החשבון, יש לאמת תחילה את הסיסמה הנוכחית.">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">סיסמה נוכחית</span>
                <Input
                  dir="ltr"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={passwordMutation.isPending}
                  className="bg-white text-left"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">סיסמה חדשה</span>
                <Input
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={passwordMutation.isPending}
                  className="bg-white text-left"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">אימות סיסמה חדשה</span>
                <Input
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  disabled={passwordMutation.isPending}
                  className="bg-white text-left"
                />
              </label>
              <Button type="button" disabled={!canUpdatePassword} onClick={() => passwordMutation.mutate()}>
                <KeyRound className="h-4 w-4" />
                {passwordMutation.isPending ? "מאמת ומעדכן…" : "אימות ועדכון סיסמה"}
              </Button>
            </div>
          </AccountSectionCard>
        ) : (
          <AccountSectionCard title="סיסמה" description={`החשבון מחובר באמצעות ${socialProvider}.`}>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">הסיסמה מנוהלת אצל ספק ההתחברות</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  לחשבון זה אין סיסמה נפרדת בטיפולינקס. שינוי הסיסמה מתבצע דרך {socialProvider}.
                </p>
              </div>
            </div>
          </AccountSectionCard>
        )}

        <AccountSectionCard
          title="תצוגה ונגישות"
          description="ההתאמות נשמרות במכשיר הזה וחלות מיד על האתר."
          className="lg:col-span-2"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DisplaySelect
              icon={Eye}
              label="מצב תצוגה"
              value={displayPreferences.theme}
              onChange={(value) => updateDisplayPreference("theme", value as DisplayPreferences["theme"])}
              options={[
                ["system", "לפי המכשיר"],
                ["light", "בהיר"],
                ["dark", "כהה"],
              ]}
            />
            <DisplaySelect
              icon={Palette}
              label="פלטת צבעים"
              value={displayPreferences.palette}
              onChange={(value) => updateDisplayPreference("palette", value as DisplayPreferences["palette"])}
              options={[
                ["tipulinks", "טיפולינקס"],
                ["ocean", "אוקיינוס"],
                ["sage", "מרווה"],
              ]}
            />
            <DisplaySelect
              icon={Eye}
              label="ניגודיות"
              value={displayPreferences.contrast}
              onChange={(value) => updateDisplayPreference("contrast", value as DisplayPreferences["contrast"])}
              options={[
                ["standard", "רגילה"],
                ["high", "גבוהה"],
              ]}
            />
            <DisplaySelect
              icon={Eye}
              label="גודל טקסט"
              value={displayPreferences.fontSize}
              onChange={(value) => updateDisplayPreference("fontSize", value as DisplayPreferences["fontSize"])}
              options={[
                ["small", "קטן"],
                ["medium", "בינוני"],
                ["large", "גדול"],
              ]}
            />
          </div>
        </AccountSectionCard>

        <AccountSectionCard title="יצירת קשר עם הצוות" description="דיווח על תקלה, תלונה, הצעה לשיפור או עניין אחר.">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">סוג הפנייה</span>
              <Select value={supportCategory} onValueChange={(value) => setSupportCategory(value as SupportCategory)}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">דיווח על תקלה</SelectItem>
                  <SelectItem value="complaint">תלונה</SelectItem>
                  <SelectItem value="suggestion">הצעה לשיפור</SelectItem>
                  <SelectItem value="other">עניין אחר</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">נושא</span>
              <Input
                value={supportSubject}
                onChange={(event) => setSupportSubject(event.target.value)}
                maxLength={120}
                disabled={supportMutation.isPending}
                className="bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">פירוט</span>
              <Textarea
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                rows={5}
                maxLength={4000}
                disabled={supportMutation.isPending}
                className="resize-y bg-white"
              />
            </label>
            <Button type="button" disabled={!canSubmitSupport} onClick={() => supportMutation.mutate()}>
              {supportMutation.isPending ? <LifeBuoy className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {supportMutation.isPending ? "שולח…" : "שליחת הפנייה"}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              לאחר שהצוות יענה, המשך ההתכתבות יתבצע באימייל של החשבון. כאן יוצג סטטוס הפנייה בלבד.
            </p>
          </div>
        </AccountSectionCard>

        <AccountSectionCard title="פניות אחרונות לצוות" description="עד 10 הפניות אחרונות שנשלחו דרך טיפולינקס.">
          <SupportRequestHistory
            requests={supportRequestsQuery.data ?? []}
            loading={supportRequestsQuery.isLoading}
            error={supportRequestsQuery.isError}
            onRetry={() => void supportRequestsQuery.refetch()}
          />
        </AccountSectionCard>

        <DeleteAccountPanel
          pending={deleteAccountMutation.isPending || settleDeleteAccountMutation.isPending}
          settlementPending={settleDeleteAccountMutation.isPending}
          state={accountDeletionState}
          errorMessage={accountDeletionError}
          onConfirm={() => deleteAccountMutation.mutate()}
          onSettle={() => settleDeleteAccountMutation.mutate()}
        />
      </div>
    </>
  );
}

const SUPPORT_STATUS_LABELS: Record<MySupportRequest["status"], string> = {
  new: "חדשה",
  in_review: "בטיפול",
  resolved: "נפתרה",
  closed: "נסגרה",
};

const SUPPORT_CATEGORY_LABELS: Record<MySupportRequest["category"], string> = {
  bug: "תקלה",
  complaint: "תלונה",
  suggestion: "הצעה לשיפור",
  other: "עניין אחר",
};

function SupportRequestHistory({
  requests,
  loading,
  error,
  onRetry,
}: {
  requests: MySupportRequest[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (loading) return <p className="text-xs text-muted-foreground">טוען פניות קודמות…</p>;
  if (error) {
    return (
      <div>
        <p className="text-xs text-destructive">לא הצלחנו לטעון את הפניות הקודמות.</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          ניסיון חוזר
        </Button>
      </div>
    );
  }
  if (!requests.length) {
    return <p className="text-sm leading-6 text-muted-foreground">עדיין לא נשלחו פניות לצוות מתוך החשבון.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {requests.slice(0, 10).map((request) => (
        <li key={request.id} className="rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{request.subject}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {SUPPORT_CATEGORY_LABELS[request.category]} ·{" "}
                {new Intl.DateTimeFormat("he-IL", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }).format(new Date(request.created_at))}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
              {SUPPORT_STATUS_LABELS[request.status]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DisplaySelect({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="block rounded-xl border border-border bg-surface p-3">
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-brand" />
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function formatDeletionBalance(agorot: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: agorot % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(agorot / 100);
}

function DeleteAccountPanel({
  pending,
  settlementPending,
  state,
  errorMessage,
  onConfirm,
  onSettle,
}: {
  pending: boolean;
  settlementPending: boolean;
  state: AccountDeletionState | null;
  errorMessage: string | null;
  onConfirm: () => void;
  onSettle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const phrase = "מחיקת החשבון לצמיתות";

  function close(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !pending && !state) {
      setAcknowledged(false);
      setConfirmation("");
    }
  }

  const frozen = Boolean(state?.profile_frozen);
  const balance = state?.outstanding_agorot ?? 0;
  const supportEmail = state?.support_email || "admin@tipulinks.co.il";

  return (
    <section className="rounded-2xl border border-destructive/25 bg-surface-elevated shadow-card lg:col-span-2">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-medium text-muted-foreground marker:content-none sm:px-5">
          <span className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span>אפשרויות מחיקת החשבון</span>
          </span>
          <span className="text-xs group-open:hidden">הצגה</span>
          <span className="hidden text-xs group-open:inline">הסתרה</span>
        </summary>

        <div className="border-t border-destructive/20 px-4 py-4 sm:px-5 sm:py-5">
          <h2 className="text-lg font-semibold text-destructive">מחיקת החשבון לצמיתות</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            המחיקה תסיר לצמיתות את חשבון ההתחברות, הפרופיל, המסמכים וכל המידע המקצועי שנשמר בו. לא ניתן לבטל את הפעולה
            או לשחזר את החשבון לאחר מכן.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
            כדי לכבד את בקשת אי־הפנייה ולמנוע יצירת פרופיל חדש בטעות, כתובות האימייל של החשבון והפרופיל יישמרו בלבד
            ברשימת אי־פנייה מוגנת. לא יישמרו בה שם, טלפון או תוכן הפרופיל.
          </p>
          {frozen ? (
            <p className="mt-3 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              בקשת המחיקה נמצאת בתהליך. הפרופיל הוקפא ואינו מקבל פניות חדשות, כדי שלא יצטברו חיובים נוספים.
            </p>
          ) : null}
          <Button type="button" variant="destructive" className="mt-4" onClick={() => setOpen(true)}>
            {frozen ? "המשך תהליך מחיקת החשבון" : "מחיקת החשבון"}
          </Button>
        </div>
      </details>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>אישור מחיקת החשבון</DialogTitle>
            <DialogDescription>
              {state
                ? "הפרופיל הוקפא ולא יקבל פניות חדשות עד להשלמת תהליך המחיקה."
                : "לאחר המחיקה לא תהיה אפשרות לשחזר את החשבון או את הפרופיל."}
            </DialogDescription>
          </DialogHeader>

          {!state ? (
            <div className="space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <Checkbox checked={acknowledged} onCheckedChange={(value) => setAcknowledged(value === true)} />
                <span className="text-sm text-foreground">
                  ברור לי שהמחיקה היא לצמיתות ולא ניתן לשחזר את החשבון או את הפרופיל.
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-foreground">כדי לאשר, הקלידו: {phrase}</span>
                <Input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </label>
              {errorMessage ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
                  {errorMessage}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
                  ביטול
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending || !acknowledged || confirmation !== phrase}
                  onClick={onConfirm}
                >
                  {pending ? "מקפיא ובודק את החשבון…" : "כן, המשך למחיקת החשבון"}
                </Button>
              </div>
            </div>
          ) : null}

          {state?.status === "payment_required" || state?.status === "payment_failed" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-semibold text-foreground">קיימת יתרה שטרם חויבה</p>
                <p className="mt-2 text-2xl font-bold text-foreground" dir="ltr">
                  {formatDeletionBalance(balance)}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  מחיקת החשבון תושלם רק לאחר סילוק היתרה. באישור הפעולה יתבצע חיוב מיידי באמצעי התשלום השמור.
                </p>
              </div>
              {errorMessage ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
                  {errorMessage}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
                  סגירה
                </Button>
                <Button type="button" variant="destructive" disabled={pending} onClick={onSettle}>
                  {settlementPending
                    ? "מחייב ומוחק את החשבון…"
                    : `אישור חיוב ${formatDeletionBalance(balance)} ומחיקת החשבון`}
                </Button>
              </div>
            </div>
          ) : null}

          {state?.status === "payment_method_required" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <p className="font-semibold">לא ניתן להשלים את המחיקה ללא אמצעי תשלום פעיל.</p>
                <p className="mt-1">
                  היתרה הפתוחה היא <strong>{formatDeletionBalance(balance)}</strong>. הפרופיל נשאר מוקפא ואינו מקבל
                  פניות חדשות.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  סגירה
                </Button>
                <Button type="button" asChild>
                  <a href="/account/billing">לעדכון אמצעי התשלום</a>
                </Button>
              </div>
            </div>
          ) : null}

          {state?.status === "blocked_pending_leads" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <p className="font-semibold">מחיקת החשבון אינה אפשרית כרגע.</p>
                <p className="mt-1">
                  קיימת פנייה שעדיין נמצאת בתהליך ולכן לא ניתן לקבוע בבטחה את היתרה הסופית. הפרופיל נשאר מוקפא ולא יקבל
                  פניות חדשות.
                </p>
                <p className="mt-2">
                  אם המצב אינו משתנה, יש לפנות לתמיכה ב־
                  <a className="font-semibold underline" href={`mailto:${supportEmail}`} dir="ltr">
                    {supportEmail}
                  </a>
                  .
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  סגירה
                </Button>
                <Button type="button" disabled={pending} onClick={onConfirm}>
                  {pending ? "בודק שוב…" : "בדיקה חוזרת"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
