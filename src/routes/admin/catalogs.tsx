import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAdminCatalogs, type AdminCatalog, type AdminCatalogItem } from "@/lib/admin-catalogs.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/catalogs")({
  head: () => ({
    meta: [
      { title: "קטלוגים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "צפייה בקטלוגים של המערכת" },
    ],
  }),
  component: CatalogsPage,
});

const columns: AdminColumn<AdminCatalogItem>[] = [
  { key: "name", header: "שם", render: (row) => <span className="font-medium">{row.name}</span> },
  {
    key: "slug",
    header: "slug / קוד",
    render: (row) => (
      <span dir="ltr" className="text-xs text-muted-foreground">
        {row.slug}
      </span>
    ),
  },
  {
    key: "status",
    header: "סטטוס",
    render: (row) => <AdminStatusBadge status={row.active ? "פעיל" : "לא פעיל"} />,
  },
  { key: "order", header: "סדר תצוגה", hideOnNarrow: true, render: (row) => row.order },
];

function CatalogsPage() {
  const listFn = useServerFn(listAdminCatalogs);
  const catalogs = useQuery({ queryKey: ["admin-catalogs"], queryFn: () => listFn() });
  const rows = catalogs.data ?? [];

  return (
    <div>
      <AdminPageHeader
        title="קטלוגים"
        subtitle={catalogs.isLoading ? "טוען קטלוגים…" : "צפייה בנתוני הקטלוגים האמיתיים של המערכת"}
        breadcrumb="קטלוגים"
      />

      {catalogs.isError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          לא ניתן לטעון את הקטלוגים.
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((catalog) => {
          const active = catalog.items.filter((item) => item.active).length;
          const inactive = catalog.items.length - active;
          return (
            <Card key={catalog.key} className="shadow-card">
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground">{catalog.label}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Stat label="פריטים" value={catalog.items.length} />
                  <Stat label="פעילים" value={active} />
                  <Stat label="לא פעילים" value={inactive} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rows.length > 0 ? (
        <Tabs defaultValue={rows[0]!.key} dir="rtl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              {rows.map((catalog) => (
                <TabsTrigger key={catalog.key} value={catalog.key} className="text-xs">
                  {catalog.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <span className="text-xs text-muted-foreground">מצב צפייה בלבד</span>
          </div>

          {rows.map((catalog) => (
            <CatalogTab key={catalog.key} catalog={catalog} />
          ))}
        </Tabs>
      ) : catalogs.isLoading ? null : (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          אין קטלוגים להצגה.
        </div>
      )}
    </div>
  );
}

function CatalogTab({ catalog }: { catalog: AdminCatalog }) {
  return (
    <TabsContent value={catalog.key}>
      <AdminDataTable
        columns={columns}
        rows={catalog.items}
        getRowId={(row) => row.slug}
        emptyTitle="אין פריטים להצגה"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        הנתונים מוצגים ממקור האמת של המערכת. בשלב זה אין אפשרות לבצע שינויים דרך מסך האדמין.
      </p>
    </TabsContent>
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
