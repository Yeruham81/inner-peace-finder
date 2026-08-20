import { createFileRoute } from "@tanstack/react-router";
import { Bell, CirclePause, Mail, ShieldCheck } from "lucide-react";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/account/settings")({
  head: () => ({
    meta: [{ title: "הגדרות | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  const { user } = Route.useRouteContext();

  return (
    <>
      <AccountPageHeader
        eyebrow="העדפות חשבון"
        title="הגדרות"
        description="הגדרות החשבון וההתראות ירוכזו כאן. בשלב זה המסך הוא תצוגת UI בלבד ואינו שומר שינויים חדשים."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AccountSectionCard title="פרטי החשבון" description="הפרטים המשמשים להתחברות לטיפולינקס.">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">כתובת אימייל</span>
              <Input value={user.email ?? ""} readOnly dir="ltr" className="bg-muted/40 text-left" />
            </label>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-semibold text-foreground">אבטחת החשבון</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">שינוי סיסמה וניהול אמצעי אימות יתווספו כאן בהמשך.</p>
              </div>
            </div>
          </div>
        </AccountSectionCard>

        <AccountSectionCard title="התראות" description="העדפות לקבלת עדכונים על פעילות בפרופיל.">
          <div className="space-y-4">
            <PreviewSetting icon={Mail} title="פנייה חדשה" description="קבלת התראה כאשר נוצרת פנייה חדשה דרך טיפולינקס." />
            <PreviewSetting icon={Bell} title="עדכוני חשבון" description="עדכונים על אימות מסמכים, חיובים ושינויים חשובים." />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">המתגים מוצגים לצורך תכנון הממשק בלבד ואינם נשמרים עדיין.</p>
        </AccountSectionCard>

        <AccountSectionCard title="מצב הפרופיל" description="פעולות הקשורות לנראות הפרופיל באתר." className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CirclePause className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-semibold text-foreground">הקפאה והסרה</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  הפעולות הקיימות בעורך הפרופיל יועברו לכאן רק לאחר שנחבר את מסך ההגדרות ל-backend.
                </p>
              </div>
            </div>
            <Button variant="outline" disabled>ניהול מצב הפרופיל</Button>
          </div>
        </AccountSectionCard>
      </div>
    </>
  );
}

function PreviewSetting({ icon: Icon, title, description }: { icon: typeof Mail; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked disabled aria-label={title} />
    </div>
  );
}
