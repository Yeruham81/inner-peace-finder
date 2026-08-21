import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות מערכת | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "הגדרות מערכת עתידיות" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [systemName, setSystemName] = useState("טיפולינקס");
  const [supportEmail, setSupportEmail] = useState("support@example.com");
  const [maintenance, setMaintenance] = useState(false);
  const [channels, setChannels] = useState({ whatsapp: true, phone: true, email: true });
  const [saved, setSaved] = useState<string | null>(null);

  function mockSave(section: string) {
    setSaved(section);
    window.setTimeout(() => setSaved(null), 2500);
  }

  return (
    <div>
      <AdminPageHeader
        title="הגדרות מערכת"
        subtitle="הגדרות הדגמה בלבד — אינן נשמרות ואינן משפיעות על המערכת"
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
            <CardTitle className="text-base">הגדרות פניות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">ערוצי פנייה זמינים (הדגמה)</p>
            <div className="space-y-2">
              {(
                [
                  ["whatsapp", "WhatsApp"],
                  ["phone", "שיחת טלפון"],
                  ["email", "אימייל"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="text-sm text-foreground">{label}</span>
                  <Switch
                    checked={channels[key]}
                    onCheckedChange={(value) => setChannels((current) => ({ ...current, [key]: value }))}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
            <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
              הגדרות עתידיות של חיוב ליד יוגדרו בשלב מאוחר יותר.
            </div>
            <SaveRow section="leads" saved={saved} onSave={mockSave} />
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
