import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, CircleAlert, Clock, MessageSquare, UserRoundCheck, UsersRound } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "לוח בקרה | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "סקירה כללית של פעילות המערכת באזור הניהול." },
    ],
  }),
  component: AdminDashboardPage,
});

const MOCK_STATS = [
  { label: "מטפלים במערכת", value: 128, icon: UsersRound, hint: "נתוני הדגמה" },
  { label: "פרופילים פעילים", value: 94, icon: BadgeCheck, hint: "נתוני הדגמה" },
  { label: "פרופילים הממתינים לבדיקה", value: 12, icon: Clock, hint: "נתוני הדגמה" },
  { label: "בקשות אימות ממתינות", value: 7, icon: CircleAlert, hint: "נתוני הדגמה" },
  { label: "פניות בתקופה האחרונה", value: 43, icon: MessageSquare, hint: "30 הימים האחרונים" },
  { label: "בקשות שיוך ממתינות", value: 5, icon: UserRoundCheck, hint: "נתוני הדגמה" },
];

const MOCK_ACTIVITY = [
  { text: "פרופיל חדש נוצר", meta: "לפני 12 דקות" },
  { text: "בקשת אימות חדשה", meta: "לפני 40 דקות" },
  { text: "פנייה חדשה נשלחה", meta: "לפני שעה" },
  { text: "בקשת שיוך חדשה", meta: "לפני 3 שעות" },
];

const MOCK_TASKS: Array<{ text: string; status: string; tone: "warn" | "info" | "alert" }> = [
  { text: "אימות הסמכה ממתין", status: "ממתין", tone: "warn" },
  { text: "פרופיל שדורש בדיקה", status: "לבדיקה", tone: "info" },
  { text: "בקשת שיוך שטרם טופלה", status: "דחוף", tone: "alert" },
];

const TONE_CLASS: Record<"warn" | "info" | "alert", string> = {
  warn: "bg-accent/25 text-accent-foreground",
  info: "bg-secondary text-secondary-foreground",
  alert: "bg-destructive/10 text-destructive",
};

function AdminDashboardPage() {
  return (
    <div>
      <AdminPageHeader title="לוח בקרה" subtitle="סקירה כללית של פעילות המערכת. הנתונים המוצגים הם נתוני הדגמה." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_STATS.map((stat) => (
          <AdminStatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">פעילות אחרונה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border">
              {MOCK_ACTIVITY.map((item) => (
                <li key={item.text} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="text-foreground">{item.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.meta}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">משימות הדורשות טיפול</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border">
              {MOCK_TASKS.map((task) => (
                <li key={task.text} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="text-foreground">{task.text}</span>
                  <Badge variant="secondary" className={TONE_CLASS[task.tone]}>
                    {task.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}