import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
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
  const channelsQuery = useQuery({
    queryKey: ["admin-contact-channel-availability"],
    queryFn: () => getChannelsFn(),
  });
  const registrationQuery = useQuery({
    queryKey: ["admin-therapist-registration-availability"],
    queryFn: () => getRegistrationFn(),
  });

  const [systemName, setSystemName] = useState("טיפולינקס");
  const [supportEmail, setSupportEmail] = useState("support@example.com");
  const [maintenance, setMaintenance] = useState(false);
  const [channels, setChannels] = useState<ContactChannelAvailability>({
    ...DEFAULT_CONTACT_CHANNEL_AVAILABILITY,
  });
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (channelsQuery.data) setChannels(channelsQuery.data);
  }, [channelsQuery.data]);

  useEffect(() => {
    if (registrationQuery.data) setRegistrationEnabled(registrationQuery.data.enabled);
  }, [registrationQuery.data]);

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
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את הגדרת הרשמת המטפלים."),
  });

  function mockSave(section: string) {
    setSaved(section);
    window.setTimeout(() => setSaved(null), 2500);
  }

  return (
    <div>
      <AdminPageHeader
        title="הגדרות מערכת"
        subtitle="הגדרות ערוצי הפנייה והרשמת המטפלים פעילות ונשמרות במערכת; יתר האזורים במסך עדיין מיועדים להגדרות עתידיות."
        breadcrumb="הגדרות מערכת"
      />

      <div className="space-y-4">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">הגדרות כלליות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="system-name" className="mb-1 block text-xs text-muted-foreground">
                  שם המערכת
                </Label>
                <Input id="system-name" value={systemName} onChange={(event) => setSystemName(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="support-email" className="mb-1 block text-xs text-muted-foreground">
                  כתובת תמיכה
                </Label>
                <Input
                  id="support-email"
                  dir="ltr"
                  value={supportEmail}
                  onChange={(event) => setSupportEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">מצב תחזוקה</p>
                <p className="text-[11px] text-muted-foreground">מתג הדגמה — אינו משפיע על האתר.</p>
              </div>
              <Switch checked={maintenance} onCheckedChange={setMaintenance} aria-label="מצב תחזוקה" />
            </div>

            <SaveRow section="general" saved={saved} onSave={mockSave} />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">הרשמת מטפלים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              כאשר האפשרות כבויה, לא ניתן ליצור חשבון מטפל חדש. חשבונות מטפלים קיימים יכולים להמשיך להיכנס ולעבוד כרגיל.
            </p>
            {registrationQuery.isLoading ? (
              <p className="py-3 text-sm text-muted-foreground">טוען את הגדרת ההרשמה…</p>
            ) : registrationQuery.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                לא ניתן לטעון את הגדרת הרשמת המטפלים. נסו לרענן את העמוד.
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">אפשר הרשמת מטפלים חדשים</p>
                  <p className="text-[11px] text-muted-foreground">
                    {registrationEnabled ? "ההרשמה פתוחה" : "ההרשמה סגורה זמנית"}
                  </p>
                </div>
                <Switch
                  checked={registrationEnabled}
                  disabled={registrationMutation.isPending}
                  onCheckedChange={setRegistrationEnabled}
                  aria-label="אפשר הרשמת מטפלים חדשים"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={registrationQuery.isLoading || registrationQuery.isError || registrationMutation.isPending}
                onClick={() => registrationMutation.mutate()}
              >
                {registrationMutation.isPending ? "שומר…" : "שמירה"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">הגדרות פניות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              ערוץ כבוי מוסתר מהציבור ונחסם בצד השרת. בחירת המטפל נשמרת ותוחזר אוטומטית כאשר הערוץ יופעל מחדש.
            </p>
            {channelsQuery.isLoading ? (
              <p className="py-3 text-sm text-muted-foreground">טוען את הגדרות ערוצי הפנייה…</p>
            ) : channelsQuery.isError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                לא ניתן לטעון את הגדרות ערוצי הפנייה. נסו לרענן את העמוד.
              </div>
            ) : (
              <div className="space-y-2">
                {(
                  [
                    ["whatsapp", "WhatsApp"],
                    ["phone", "שיחת טלפון"],
                    ["email", "אימייל"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <span className="text-sm text-foreground">{label}</span>
                      <p className="text-[11px] text-muted-foreground">
                        {channels[key] ? "זמין למטפלים" : "לא זמין כרגע"}
                      </p>
                    </div>
                    <Switch
                      checked={channels[key]}
                      disabled={channelMutation.isPending}
                      onCheckedChange={(value) => setChannels((current) => ({ ...current, [key]: value }))}
                      aria-label={label}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={channelsQuery.isLoading || channelsQuery.isError || channelMutation.isPending}
                onClick={() => channelMutation.mutate()}
              >
                {channelMutation.isPending ? "שומר…" : "שמירה"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">הגדרות חיפוש</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              אזור להגדרות חיפוש עתידיות. מנוע החיפוש, הטקסונומיה והדירוג אינם ניתנים לשינוי ממסך זה.
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              אבטחה והרשאות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">ניהול הרשאות מנהלים יוגדר בשלב מאוחר יותר.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SaveRow({
  section,
  saved,
  onSave,
}: {
  section: string;
  saved: string | null;
  onSave: (section: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" onClick={() => onSave(section)}>
        שמירה
      </Button>
      {saved === section ? <span className="text-xs text-muted-foreground">נשמר (הדגמה מקומית בלבד)</span> : null}
    </div>
  );
}
