import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Eye, KeyRound, LifeBuoy, Mail, Palette, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { submitMySupportRequest } from "@/lib/account-support.functions";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/account-settings.functions";
import { getDisplayPreferences, saveDisplayPreferences, type DisplayPreferences } from "@/lib/display-preferences";
import { deleteMyAccountPermanently } from "@/lib/therapist-profile.functions";

export const Route = createFileRoute("/_authenticated/account/settings")({
  head: () => ({
    meta: [{ title: "הגדרות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountSettingsPage,
});

type SupportCategory = "bug" | "complaint" | "suggestion" | "other";

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
  const submitSupportFn = useServerFn(submitMySupportRequest);
  const getNotificationPreferencesFn = useServerFn(getMyNotificationPreferences);
  const updateNotificationPreferencesFn = useServerFn(updateMyNotificationPreferences);
  const [loginEmail, setLoginEmail] = useState(user.email ?? "");
  const [loginEmailRequestSent, setLoginEmailRequestSent] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [displayPreferences, setDisplayPreferences] = useState<DisplayPreferences>(() => getDisplayPreferences());
  const [supportCategory, setSupportCategory] = useState<SupportCategory>("bug");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    notify_new_leads: true,
    notify_account_updates: true,
  });

  const notificationPreferencesQuery = useQuery({
    queryKey: ["my-notification-preferences"],
    queryFn: () => getNotificationPreferencesFn(),
  });

  useEffect(() => {
    if (notificationPreferencesQuery.data) {
      setNotificationPreferences(notificationPreferencesQuery.data);
    }
  }, [notificationPreferencesQuery.data]);

  const notificationPreferencesMutation = useMutation({
    mutationFn: (preferences: NotificationPreferences) => updateNotificationPreferencesFn({ data: preferences }),
    onSuccess: (preferences) => {
      setNotificationPreferences(preferences);
      queryClient.setQueryData(["my-notification-preferences"], preferences);
      toast.success("העדפות ההתראות נשמרו.");
    },
    onError: (error: Error) => {
      if (notificationPreferencesQuery.data) {
        setNotificationPreferences(notificationPreferencesQuery.data);
      }
      toast.error(error.message || "לא ניתן לעדכן את העדפות ההתראות.");
    },
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
    onSuccess: () => {
      setSupportSubject("");
      setSupportMessage("");
      toast.success("הפנייה נשלחה לצוות טיפולינקס.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשלוח את הפנייה."),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccountFn({ data: { confirmation: "מחיקת החשבון לצמיתות" } }),
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut({ scope: "local" });
      window.location.assign("/");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן למחוק את החשבון."),
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

  function updateNotificationPreference(key: keyof NotificationPreferences, enabled: boolean) {
    const next = { ...notificationPreferences, [key]: enabled };
    setNotificationPreferences(next);
    notificationPreferencesMutation.mutate(next);
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

        <AccountSectionCard title="התראות" description="עדכונים על פעילות בפרופיל ובחשבון.">
          <div className="space-y-3">
            <NotificationSetting
              icon={Mail}
              title="פנייה חדשה"
              description="התראה כאשר מתקבלת פנייה חדשה."
              checked={notificationPreferences.notify_new_leads}
              disabled={notificationPreferencesQuery.isLoading || notificationPreferencesMutation.isPending}
              onCheckedChange={(checked) => updateNotificationPreference("notify_new_leads", checked)}
            />
            <NotificationSetting
              icon={Bell}
              title="עדכוני חשבון"
              description="אימות מסמכים, חיובים ושינויים חשובים."
              checked={notificationPreferences.notify_account_updates}
              disabled={notificationPreferencesQuery.isLoading || notificationPreferencesMutation.isPending}
              onCheckedChange={(checked) => updateNotificationPreference("notify_account_updates", checked)}
            />
          </div>
          {notificationPreferencesQuery.isError && (
            <p className="mt-3 text-xs leading-5 text-destructive">לא הצלחנו לטעון את העדפות ההתראות.</p>
          )}
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
                rows={4}
                maxLength={4000}
                disabled={supportMutation.isPending}
                className="resize-y bg-white"
              />
            </label>
            <Button type="button" disabled={!canSubmitSupport} onClick={() => supportMutation.mutate()}>
              {supportMutation.isPending ? <LifeBuoy className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {supportMutation.isPending ? "שולח…" : "שליחת הפנייה"}
            </Button>
          </div>
        </AccountSectionCard>

        <DeleteAccountPanel
          pending={deleteAccountMutation.isPending}
          onConfirm={() => deleteAccountMutation.mutate()}
        />
      </div>
    </>
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

function NotificationSetting({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

function DeleteAccountPanel({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const phrase = "מחיקת החשבון לצמיתות";

  function close(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !pending) {
      setAcknowledged(false);
      setConfirmation("");
    }
  }

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
          <Button type="button" variant="destructive" className="mt-4" onClick={() => setOpen(true)}>
            מחיקת החשבון
          </Button>
        </div>
      </details>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>אישור מחיקת החשבון</DialogTitle>
            <DialogDescription>
              זהו השלב האחרון. לאחר המחיקה לא תהיה אפשרות לשחזר את החשבון או את הפרופיל.
            </DialogDescription>
          </DialogHeader>
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
                {pending ? "החשבון נמחק…" : "כן, מחיקת החשבון לצמיתות"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
