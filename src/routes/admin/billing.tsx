import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Receipt, TrendingUp, Wallet } from "lucide-react";

import { AdminDataTable, type AdminColumn } from "@/components/admin/admin-data-table";
import { formatAdminDate } from "@/components/admin/admin-formatters";
import {
  MOCK_CREDITS,
  MOCK_INVOICES,
  MOCK_PRICE_LIST,
  MOCK_TRANSACTIONS,
  type MockTransaction,
} from "@/components/admin/admin-mock-data";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/billing")({
  head: () => ({
    meta: [
      { title: "חיובים | ניהול טיפולינקס" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "תצוגת הכנה לאזור החיובים" },
    ],
  }),
  component: BillingPage,
});

const transactionColumns: AdminColumn<MockTransaction>[] = [
  { key: "date", header: "תאריך", render: (row) => <span dir="ltr">{formatAdminDate(row.date)}</span> },
  { key: "therapistName", header: "מטפל/ת", render: (row) => <span className="font-medium">{row.therapistName}</span> },
  { key: "kind", header: "סוג חיוב", render: (row) => row.kind },
  { key: "amount", header: "סכום", render: (row) => <span dir="ltr">{row.amount}</span> },
  { key: "status", header: "סטטוס", render: (row) => <AdminStatusBadge status={row.status} /> },
];

function BillingPage() {
  return (
    <div>
      <AdminPageHeader
        title="חיובים"
        subtitle="תצוגת הכנה בלבד — אין חישוב, גבייה או ספק תשלומים"
        breadcrumb="חיובים"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard label="הכנסות החודש" value="₪4,820" icon={TrendingUp} hint="נתוני הדגמה" />
        <AdminStatCard label="לידים לחיוב" value={38} icon={Receipt} hint="נתוני הדגמה" />
        <AdminStatCard label="מטפלים פעילים לחיוב" value={21} icon={CreditCard} hint="נתוני הדגמה" />
        <AdminStatCard label="יתרות / קרדיטים" value="₪865" icon={Wallet} hint="נתוני הדגמה" />
      </div>

      <Tabs defaultValue="transactions" dir="rtl">
        <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="transactions" className="text-xs">
            עסקאות
          </TabsTrigger>
          <TabsTrigger value="charges" className="text-xs">
            חיובים
          </TabsTrigger>
          <TabsTrigger value="pricing" className="text-xs">
            מחירון
          </TabsTrigger>
          <TabsTrigger value="credits" className="text-xs">
            קרדיטים
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">
            חשבוניות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <AdminDataTable
            columns={transactionColumns}
            rows={MOCK_TRANSACTIONS}
            getRowId={(row) => row.id}
            mobileRow={(row) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{row.therapistName}</span>
                  <AdminStatusBadge status={row.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.kind} · <span dir="ltr">{row.amount}</span> · <span dir="ltr">{formatAdminDate(row.date)}</span>
                </p>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="charges">
          <AdminDataTable
            columns={transactionColumns}
            rows={MOCK_TRANSACTIONS.filter((row) => row.kind === "חיוב ליד")}
            getRowId={(row) => row.id}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">הדגמה בלבד — אין קישור בין פניות לחיובים.</p>
        </TabsContent>

        <TabsContent value="pricing">
          <AdminDataTable
            columns={[
              { key: "name", header: "פריט", render: (row) => <span className="font-medium">{row.name}</span> },
              { key: "price", header: "מחיר", render: (row) => <span dir="ltr">{row.price}</span> },
              { key: "note", header: "הערה", hideOnNarrow: true, render: (row) => row.note },
            ]}
            rows={MOCK_PRICE_LIST}
            getRowId={(row) => row.name}
          />
        </TabsContent>

        <TabsContent value="credits">
          <AdminDataTable
            columns={[
              {
                key: "therapistName",
                header: "מטפל/ת",
                render: (row) => <span className="font-medium">{row.therapistName}</span>,
              },
              { key: "balance", header: "יתרה", render: (row) => <span dir="ltr">{row.balance}</span> },
              {
                key: "updatedAt",
                header: "עדכון אחרון",
                hideOnNarrow: true,
                render: (row) => <span dir="ltr">{formatAdminDate(row.updatedAt)}</span>,
              },
            ]}
            rows={MOCK_CREDITS}
            getRowId={(row) => row.therapistName}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <AdminDataTable
            columns={[
              {
                key: "id",
                header: "מזהה",
                render: (row) => (
                  <span dir="ltr" className="font-medium">
                    {row.id}
                  </span>
                ),
              },
              { key: "date", header: "תאריך", render: (row) => <span dir="ltr">{formatAdminDate(row.date)}</span> },
              { key: "therapistName", header: "מטפל/ת", render: (row) => row.therapistName },
              { key: "amount", header: "סכום", render: (row) => <span dir="ltr">{row.amount}</span> },
              { key: "status", header: "סטטוס", render: (row) => <AdminStatusBadge status={row.status} /> },
            ]}
            rows={MOCK_INVOICES}
            getRowId={(row) => row.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
