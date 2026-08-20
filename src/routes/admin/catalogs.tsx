import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { MOCK_CATALOGS, type MockCatalogItem } from "@/components/admin/admin-mock-data";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/catalogs")({
  head: () => ({
    meta: [
      { title: "קטלוגים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "מבנה ניהול הקטלוגים של המערכת" },
    ],
  }),
  component: CatalogsPage,
});

type LocalItems = Record<string, MockCatalogItem[]>;

function CatalogsPage() {
  const [items, setItems] = useState<LocalItems>(() =>
    Object.fromEntries(MOCK_CATALOGS.map((catalog) => [catalog.key, catalog.items])),
  );

  function toggleItem(catalogKey: string, slug: string) {
    setItems((current) => ({
      ...current,
      [catalogKey]: (current[catalogKey] ?? []).map((item) =>
        item.slug === slug ? { ...item, active: !item.active } : item,
      ),
    }));
  }

  const columns = (catalogKey: string): AdminColumn<MockCatalogItem>[] => [
    { key: "name", header: "שם", render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "slug", header: "slug", render: (row) => <span dir="ltr" className="text-xs text-muted-foreground">{row.slug}</span> },
    { key: "status", header: "סטטוס", render: (row) => <AdminStatusBadge status={row.active ? "פעיל" : "לא פעיל"} /> },
    { key: "order", header: "סדר תצוגה", hideOnNarrow: true, render: (row) => row.order },
    {
      key: "actions",
      header: "פעולות",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" disabled>
            עריכה
          </Button>
          <Button variant="outline" size="sm" onClick={() => toggleItem(catalogKey, row.slug)}>
            {row.active ? "השבתה" : "הפעלה"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="קטלוגים"
        subtitle="מבנה ניהול הקטלוגים (נתוני הדגמה — הקטלוגים האמיתיים אינם משתנים)"
        breadcrumb="קטלוגים"
        actions={
          <Button size="sm" disabled>
            הוספת פריט
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_CATALOGS.map((catalog) => (
          <Card key={catalog.key} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-foreground">{catalog.label}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Stat label="פריטים" value={catalog.total} />
                <Stat label="פעילים" value={catalog.active} />
                <Stat label="לא פעילים" value={catalog.inactive} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">עדכון אחרון: {catalog.updatedAt}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue={MOCK_CATALOGS[0]!.key} dir="rtl">
        <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1">
          {MOCK_CATALOGS.map((catalog) => (
            <TabsTrigger key={catalog.key} value={catalog.key} className="text-xs">
              {catalog.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {MOCK_CATALOGS.map((catalog) => (
          <TabsContent key={catalog.key} value={catalog.key}>
            <AdminDataTable
              columns={columns(catalog.key)}
              rows={items[catalog.key] ?? []}
              getRowId={(row) => row.slug}
              emptyTitle="אין פריטים להצגה"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              רשימת דוגמה בלבד. חיבור לקטלוגים האמיתיים יתבצע בשלב הבא.
            </p>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("rounded-md bg-secondary/60 p-2", className)}>
      <p className="text-base font-bold leading-none text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
