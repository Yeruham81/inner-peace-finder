import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getAdminContactChannelAvailability,
  updateAdminContactChannelAvailability,
} from "@/lib/contact-channel-settings.functions";
import { DEFAULT_CONTACT_CHANNEL_AVAILABILITY, type ContactChannelAvailability } from "@/lib/contact-channel-settings";
import {
  getAdminBillingAvailability,
  getAdminSystemSettings,
  updateAdminBillingAvailability,
  updateAdminSystemSettings,
} from "@/lib/system-settings.functions";
import { DEFAULT_SYSTEM_SETTINGS, SYSTEM_SETTING_LIMITS, type SystemSettings } from "@/lib/system-settings";
import {
  getAdminTherapistRegistrationAvailability,
  updateAdminTherapistRegistrationAvailability,
} from "@/lib/therapist-registration-settings.functions";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות מערכת | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "הגדרות מערכת" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const getChannelsFn = useServerFn(getAdminContactChannelAvailability);
  const updateChannelsFn = useServerFn(updateAdminContactChannelAvailability);
  const getRegistrationFn = useServerFn(getAdminTherapistRegistrationAvailability);
  const updateRegistrationFn = useServerFn(updateAdminTherapistRegistrationAvailability);
  const getSystemSettingsFn = useServerFn(getAdminSystemSettings);
  const updateSystemSettingsFn = useServerFn(updateAdminSystemSettings);
  const getBillingFn = useServerFn(getAdminBillingAvailability);
  const updateBillingFn = useServerFn(updateAdminBillingAvailability);

  const channelsQuery = useQuery({
    queryKey: ["admin-contact-channel-availability"],
    queryFn: () => getChannelsFn(),
  });
  const registrationQuery = useQuery({
    queryKey: ["admin-therapist-registration-availability"],
    queryFn: () => getRegistrationFn(),
  });
  const systemSettingsQuery = useQuery({
    queryKey: ["admin-system-settings"],
    queryFn: () => getSystemSettingsFn(),
  });
  const billingQuery = useQuery({
    queryKey: ["admin-billing-availability"],
    queryFn: () => getBillingFn(),
  });

  const [channels, setChannels] = useState<ContactChannelAvailability>({
    ...DEFAULT_CONTACT_CHANNEL_AVAILABILITY,
  });
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>({ ...DEFAULT_SYSTEM_SETTINGS });
  const [pricingActive, setPricingActive] = useState(false);

  useEffect(() => {
    if (channelsQuery.data) setChannels(channelsQuery.data);
  }, [channelsQuery.data]);

  useEffect(() => {
    if (registrationQuery.data) setRegistrationEnabled(registrationQuery.data.enabled);
  }, [registrationQuery.data]);

  useEffect(() => {
    if (systemSettingsQuery.data) setSettings(systemSettingsQuery.data);
  }, [systemSettingsQuery.data]);

  useEffect(() => {
    if (billingQuery.data) setPricingActive(billingQuery.data.pricingActive);
  }, [billingQuery.data]);

  const channelMutation = useMutation({
    mutationFn: () => updateChannelsFn({ data: channels }),
    onSuccess: (next) => {
      setChannels(next);
      toast.success("הגדרות ערוצי הפנייה נשמרו.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את הגדרות ערוצי הפנייה."),
  });

  const registrationMutation = useMutation({
    mutationFn: () => updateRegistrationFn({ data: { enabled: registrationEnabled } }),
    onSuccess: (next) => {
      setRegistrationEnabled(next.enabled);
      toast.success(next.enabled ? "הרשמת מטפלים חדשים הופעלה." : "הרשמת מטפלים חדשים הושבתה.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את הגדרת ההצטרפות."),
  });

  const systemMutation = useMutation({
    mutationFn: () => updateSystemSettingsFn({ data: settings }),
    onSuccess: (next) => {
      setSettings(next);
      toast.success("הגדרות המערכת נשמרו.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את הגדרות המערכת."),
  });

  const billingMutation = useMutation({
    mutationFn: () => updateBillingFn({ data: { pricingActive } }),
    onSuccess: (next) => {
      setPricingActive(next.pricingActive);
      toast.success(next.pricingActive ? "החיובים הופעלו." : "החיובים הושבתו.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשנות את מצב החיובים."),
  });

  const systemUnavailable = systemSettingsQuery.isLoading || systemSettingsQuery.isError;

  return (
    <div>
      <AdminPageHeader
        title="הגדרות מערכת"
        subtitle="שליטה בכללי הפעילות הגלובליים של טיפולינקס. ההגדרות במסך זה נשמרות ונאכפות במערכת."
        breadcrumb="הגדרות מערכת"
      />

      <div className="space-y-4">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">זמינות והצטרפות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {registrationQuery.isLoading ? (
              <p className="py-3 text-sm text-muted-foreground">טוען את הגדרת ההצטרפות…</p>
            ) : registrationQuery.isError ? (
              <LoadError text="לא ניתן לטעון את הגדרת ההצטרפות. נסו לרענן את העמוד." />
            ) : (
              <SettingsToggle
                label="אפשר הרשמת מטפלים חדשים"
                description={
                  registrationEnabled
                    ? "מטפלים חדשים יכולים להירשם לטיפולינקס."
                    : "הרשמה חדשה חסומה. מטפלים שכבר נרשמו יכולים להמשיך לערוך ולפרסם את הפרופיל שלהם."
                }
                checked={registrationEnabled}
                disabled={registrationMutation.isPending}
                onCheckedChange={setRegistrationEnabled}
              />
            )}
            <SaveButton
              loading={registrationMutation.isPending}
              disabled={registrationQuery.isLoading || registrationQuery.isError}
              onClick={() => registrationMutation.mutate()}
            />

            <div className="border-t border-border pt-3">
              {systemSettingsQuery.isLoading ? (
                <p className="py-3 text-sm text-muted-foreground">טוען את הגדרות המערכת…</p>
              ) : systemSettingsQuery.isError ? (
                <LoadError text="לא ניתן לטעון את הגדרות המערכת. נסו לרענן את העמוד." />
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="support-email" className="mb-1 block text-xs text-muted-foreground">
                      כתובת תמיכה
                    </Label>
                    <Input
                      id="support-email"
                      dir="ltr"
                      type="email"
                      value={settings.supportEmail}
                      onChange={(event) => setSettings((current) => ({ ...current, supportEmail: event.target.value }))}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      משמשת בתהליכים מערכתיים שמפנים את המשתמש לתמיכה; אינה משנה את תיבת Zoho המחוברת.
                    </p>
                  </div>

                  <SettingsToggle
                    label="מצב תחזוקה"
                    description="מציג לציבור עמוד תחזוקה ומחזיר 503; אזורי אדמין, התחברות ו־API נשארים זמינים."
                    checked={settings.maintenanceEnabled}
                    onCheckedChange={(value) => setSettings((current) => ({ ...current, maintenanceEnabled: value }))}
                  />

                  <SettingsToggle
                    label="אפשר אינדוקס במנועי חיפוש"
                    description="מתג אישור נוסף ל־SEO. אינדוקס יתאפשר רק אם גם הגדרות סביבת הייצור והדומיין הקנוני מאפשרות זאת."
                    checked={settings.searchIndexingEnabled}
                    onCheckedChange={(value) =>
                      setSettings((current) => ({ ...current, searchIndexingEnabled: value }))
                    }
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ערוצי פנייה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">
              כיבוי ערוץ מסיר מיד את הלחצן שלו גם מפרופילים קיימים שהמטפל הגדיר בהם את הערוץ, ובמקביל חוסם שימוש בו בצד
              השרת. בחירת המטפל נשמרת ותופיע שוב לאחר הפעלה מחדש.
            </p>
            {channelsQuery.isLoading ? (
              <p className="py-3 text-sm text-muted-foreground">טוען את הגדרות ערוצי הפנייה…</p>
            ) : channelsQuery.isError ? (
              <LoadError text="לא ניתן לטעון את הגדרות ערוצי הפנייה. נסו לרענן את העמוד." />
            ) : (
              <div className="space-y-2">
                {(
                  [
                    ["whatsapp", "WhatsApp"],
                    ["phone", "שיחת טלפון"],
                    ["email", "אימייל"],
                  ] as const
                ).map(([key, label]) => (
                  <SettingsToggle
                    key={key}
                    label={label}
                    description={
                      channels[key] ? "זמין בפרופילים שהמטפל הפעיל בהם את הערוץ" : "מוסתר מהציבור וחסום בשרת"
                    }
                    checked={channels[key]}
                    disabled={channelMutation.isPending}
                    onCheckedChange={(value) => setChannels((current) => ({ ...current, [key]: value }))}
                  />
                ))}
              </div>
            )}
            <SaveButton
              loading={channelMutation.isPending}
              disabled={channelsQuery.isLoading || channelsQuery.isError}
              onClick={() => channelMutation.mutate()}
            />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">כללי פרסום פרופילים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {systemUnavailable ? (
              systemSettingsQuery.isError ? (
                <LoadError text="לא ניתן לטעון את כללי הפרסום." />
              ) : (
                <Loading />
              )
            ) : (
              <>
                <SettingsToggle
                  label="חובה אימות הסמכה לפני פרסום"
                  description="כאשר פעיל, פרסום ראשון דורש לפחות הסמכה אחת בסטטוס מאומת."
                  checked={settings.requireVerifiedCredentialForPublish}
                  onCheckedChange={(value) =>
                    setSettings((current) => ({ ...current, requireVerifiedCredentialForPublish: value }))
                  }
                />
                <SettingsToggle
                  label="חובה אמצעי תשלום פעיל לפני פרסום"
                  description="כאשר כבוי, ניתן להשלים פרסום גם ללא אמצעי תשלום פעיל."
                  checked={settings.requirePaymentMethodForPublish}
                  onCheckedChange={(value) =>
                    setSettings((current) => ({ ...current, requirePaymentMethodForPublish: value }))
                  }
                />
                <SettingsToggle
                  label="חובה דרך התקשרות אחת לפחות לפני פרסום"
                  description="שומר על הדרישה שלפחות ערוץ פנייה אחד יוגדר בפרופיל בעת הפרסום."
                  checked={settings.requireContactMethodForPublish}
                  onCheckedChange={(value) =>
                    setSettings((current) => ({ ...current, requireContactMethodForPublish: value }))
                  }
                />
                <NumberSetting
                  id="max-contact-methods"
                  label="מספר דרכי התקשרות מרבי בפרופיל"
                  value={settings.maxContactMethods}
                  min={SYSTEM_SETTING_LIMITS.maxContactMethods.min}
                  max={SYSTEM_SETTING_LIMITS.maxContactMethods.max}
                  onChange={(value) => setSettings((current) => ({ ...current, maxContactMethods: value }))}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">פניות והגנת שימוש לרעה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {systemUnavailable ? (
              systemSettingsQuery.isError ? (
                <LoadError text="לא ניתן לטעון את הגדרות הפניות." />
              ) : (
                <Loading />
              )
            ) : (
              <>
                <SettingsToggle
                  label="הפעל הגבלת קצב פניות"
                  description="מפעיל את מגבלות ה־anti-spam לפי כתובת IP, סשן ומטפל. תרגיל האימות נשאר פעיל גם כשהמתג כבוי."
                  checked={settings.leadAntispamEnabled}
                  onCheckedChange={(value) => setSettings((current) => ({ ...current, leadAntispamEnabled: value }))}
                />
                <NumberSetting
                  id="lead-challenge-ttl"
                  label="תוקף תרגיל האימות (דקות)"
                  value={settings.leadChallengeTtlMinutes}
                  min={SYSTEM_SETTING_LIMITS.leadChallengeTtlMinutes.min}
                  max={SYSTEM_SETTING_LIMITS.leadChallengeTtlMinutes.max}
                  onChange={(value) => setSettings((current) => ({ ...current, leadChallengeTtlMinutes: value }))}
                />
                <NumberSetting
                  id="lead-message-max"
                  label="אורך מרבי להודעת מטופל"
                  value={settings.leadMessageMaxLength}
                  min={SYSTEM_SETTING_LIMITS.leadMessageMaxLength.min}
                  max={SYSTEM_SETTING_LIMITS.leadMessageMaxLength.max}
                  suffix="תווים"
                  onChange={(value) => setSettings((current) => ({ ...current, leadMessageMaxLength: value }))}
                />
                <SettingsToggle
                  label="הסתר פרופיל ללא בעלים לאחר הפנייה הראשונה"
                  description="כאשר פעיל, פרופיל שנוצר ממידע פומבי מוסר מהחיפוש לאחר הפנייה הראשונה עד שהמטפל מקבל בעלות ומאשר אותו."
                  checked={settings.hideUnclaimedAfterFirstLead}
                  onCheckedChange={(value) =>
                    setSettings((current) => ({ ...current, hideUnclaimedAfterFirstLead: value }))
                  }
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">חיפוש והתאמה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {systemUnavailable ? (
              systemSettingsQuery.isError ? (
                <LoadError text="לא ניתן לטעון את הגדרות החיפוש." />
              ) : (
                <Loading />
              )
            ) : (
              <>
                <SettingsToggle
                  label="חיפוש סמנטי באמצעות AI"
                  description="מאפשר ל־OpenAI לפרש ניסוח חופשי שלא הוכרע כבר באמצעות קטלוג ומילים נרדפות מדויקות."
                  checked={settings.aiSearchEnabled}
                  onCheckedChange={(value) => setSettings((current) => ({ ...current, aiSearchEnabled: value }))}
                />
                <SettingsToggle
                  label="Fallback דטרמיניסטי לחיפוש"
                  description="אם OpenAI אינו זמין — או אם חיפוש AI כבוי — מאפשר למנוע הדטרמיניסטי הקיים לנסות לסווג את הניסוח."
                  checked={settings.aiFallbackEnabled}
                  onCheckedChange={(value) => setSettings((current) => ({ ...current, aiFallbackEnabled: value }))}
                />
                <NumberSetting
                  id="search-results-limit"
                  label="מספר תוצאות ברירת מחדל"
                  value={settings.searchResultsLimit}
                  min={SYSTEM_SETTING_LIMITS.searchResultsLimit.min}
                  max={SYSTEM_SETTING_LIMITS.searchResultsLimit.max}
                  onChange={(value) => setSettings((current) => ({ ...current, searchResultsLimit: value }))}
                />
                <SettingsToggle
                  label="הצג בתוצאות גם מטפלים ללא אימות הסמכה"
                  description="כאשר כבוי, מנוע החיפוש מחזיר רק פרופילים המסומנים כמאומתים. קישור ישיר לפרופיל ציבורי אינו נחסם בגלל הגדרה זו."
                  checked={settings.showUnverifiedTherapists}
                  onCheckedChange={(value) =>
                    setSettings((current) => ({ ...current, showUnverifiedTherapists: value }))
                  }
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">חיובים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {billingQuery.isLoading ? (
              <Loading />
            ) : billingQuery.isError ? (
              <LoadError text="לא ניתן לטעון את מצב החיובים." />
            ) : (
              <>
                <SettingsToggle
                  label="חיובים פעילים"
                  description={
                    billingQuery.data?.leadPriceAgorot
                      ? `מחיר הפנייה המוגדר כעת: ${formatAgorot(billingQuery.data.leadPriceAgorot)}. כיבוי המתג מפסיק יצירת חיובים חדשים.`
                      : "לא הוגדר עדיין מחיר לפנייה. לא ניתן להפעיל חיובים לפני הגדרת מחיר."
                  }
                  checked={pricingActive}
                  disabled={billingMutation.isPending}
                  onCheckedChange={setPricingActive}
                />
                <SaveButton loading={billingMutation.isPending} onClick={() => billingMutation.mutate()} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">אימיילים והתראות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {systemUnavailable ? (
              systemSettingsQuery.isError ? (
                <LoadError text="לא ניתן לטעון את הגדרות ההתראות." />
              ) : (
                <Loading />
              )
            ) : (
              <>
                <SettingsToggle
                  label="שליחת אימיילים מערכתיים"
                  description="מתג חירום לאימיילים אוטומטיים של המערכת, כגון הזמנות לקבלת בעלות והתראות חשבון. הוא אינו מכבה פניות אימייל של מטופלים או תשובות Zoho."
                  checked={settings.systemEmailsEnabled}
                  onCheckedChange={(value) => setSettings((current) => ({ ...current, systemEmailsEnabled: value }))}
                />
                <SettingsToggle
                  label="שליחת התראות למטפלים"
                  description="שולט בהתראות סטטוס אוטומטיות כגון אימות הסמכה והגעה לתקרת התקציב."
                  checked={settings.therapistNotificationsEnabled}
                  disabled={!settings.systemEmailsEnabled}
                  onCheckedChange={(value) =>
                    setSettings((current) => ({ ...current, therapistNotificationsEnabled: value }))
                  }
                />
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3 pb-2">
          <Button disabled={systemUnavailable || systemMutation.isPending} onClick={() => systemMutation.mutate()}>
            {systemMutation.isPending ? "שומר…" : "שמירת הגדרות המערכת"}
          </Button>
          <p className="text-xs text-muted-foreground">
            שמירה זו חלה על כל הכרטיסים למעט ערוצי פנייה, הצטרפות וחיובים שלהם כפתור שמירה נפרד.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsToggle({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function NumberSetting({
  id,
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_150px] sm:items-center">
      <div>
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          טווח מותר: {min}–{max} {suffix ?? ""}
        </p>
      </div>
      <Input
        id={id}
        dir="ltr"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isInteger(next)) onChange(next);
        }}
      />
    </div>
  );
}

function SaveButton({ loading, disabled, onClick }: { loading: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button size="sm" disabled={disabled || loading} onClick={onClick}>
      {loading ? "שומר…" : "שמירה"}
    </Button>
  );
}

function LoadError({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{text}</div>
  );
}

function Loading() {
  return <p className="py-3 text-sm text-muted-foreground">טוען…</p>;
}

function formatAgorot(agorot: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}
