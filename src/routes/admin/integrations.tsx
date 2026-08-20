import { createFileRoute } from "@tanstack/react-router";
import { Mail, Phone } from "lucide-react";
import { useState } from "react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/integrations")({
  head: () => ({
    meta: [
      { title: "אינטגרציות | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "מצב חיבור ספקים חיצוניים" },
    ],
  }),
  component: IntegrationsPage,
});

const INTEGRATIONS = [
  {
    key: "twilio",
    provider: "Twilio",
    icon: Phone,
    status: "טרם חובר",
    uses: ["שיחות טלפון", "WhatsApp"],
    description: "ספק תקשורת עבור שיחות והודעות WhatsApp.",
  },
  {
    key: "brevo",
    provider: "Brevo",
    icon: Mail,
    status: "טרם חובר",
    uses: ["משלוח הודעות אימייל"],
    description: "ספק דואר אלקטרוני עבור הודעות מערכת.",
  },
];

function IntegrationsPage() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const active = INTEGRATIONS.find((item) => item.key === openKey) ?? null;

  return (
    <div>
      <AdminPageHeader
        title="אינטגרציות"
        subtitle="מצב חיבור ספקים חיצוניים (תצוגה בלבד — אין חיבור בפועל)"
        breadcrumb="אינטגרציות"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {INTEGRATIONS.map((item) => (
          <Card key={item.key} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-soft text-foreground">
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.provider}</p>
                    <p className="text-[11px] text-muted-foreground">ספק: {item.provider}</p>
                  </div>
                </div>
                <AdminStatusBadge status={item.status} />
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{item.description}</p>

              <div className="mt-3">
                <p className="text-xs font-medium text-foreground">שימושים מתוכננים</p>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {item.uses.map((use) => (
                    <li key={use}>{use}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                אזור להגדרות עתידיות — יוגדר לאחר בחירת התצורה.
              </div>

              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => setOpenKey(item.key)}>
                  הגדרה
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => (!open ? setOpenKey(null) : null)}>
        <DialogContent dir="rtl" className="text-start">
          <DialogHeader className="text-start">
            <DialogTitle>הגדרת {active?.provider}</DialogTitle>
            <DialogDescription>
              ההגדרה של ספק זה תיושם בשלב מאוחר יותר. במסך זה אין חיבור בפועל ולא נשמרים פרטי התחברות.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
