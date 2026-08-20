import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, CreditCard, ReceiptText, RotateCcw, WalletCards } from "lucide-react";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { AccountStatCard } from "@/components/account/account-stat-card";
import { ACCOUNT_MOCK_TRANSACTIONS } from "@/components/account/account-mock-data";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/account/billing")({
  head: () => ({
    meta: [{ title: "חיובים | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountBillingPage,
});

function AccountBillingPage() {
  return (
    <>
      <AccountPageHeader
        eyebrow="כספים"
        title="חיובים"
        description="מעקב אחר חיובים עבור פניות, זיכויים ותנועות בחשבון. מנגנון התשלום עצמו יחובר בשלב מאוחר יותר."
        action={<Badge variant="secondary" className="bg-brand-soft text-brand hover:bg-brand-soft">נתוני הדגמה</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AccountStatCard label="חיוב החודש" value="₪168" detail="21 פניות שחויבו" icon={CreditCard} />
        <AccountStatCard label="זיכויים" value="₪8" detail="זיכוי אחד בתקופה" icon={RotateCcw} />
        <AccountStatCard label="עלות ממוצעת לפנייה" value="₪8.00" detail="בכל הערוצים" icon={CircleDollarSign} />
        <AccountStatCard label="יתרה לתשלום" value="₪160" detail="נתון הדגמה בלבד" icon={WalletCards} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <AccountSectionCard title="היסטוריית תנועות" description="חיובים וזיכויים אחרונים בחשבון.">
          <div className="divide-y divide-border/70">
            {ACCOUNT_MOCK_TRANSACTIONS.map((transaction) => (
              <div key={transaction.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{transaction.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{transaction.date} · <span className="ltr-num">{transaction.id}</span></p>
                </div>
                <div className="shrink-0 text-left">
                  <p className={`text-sm font-bold ltr-num ${transaction.type === "זיכוי" ? "text-emerald-700" : "text-foreground"}`}>
                    {transaction.amount < 0 ? `-₪${Math.abs(transaction.amount)}` : `₪${transaction.amount}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{transaction.type}</p>
                </div>
              </div>
            ))}
          </div>
        </AccountSectionCard>

        <AccountSectionCard title="אמצעי תשלום" description="יחובר יחד עם מערכת החיוב האמיתית.">
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
            <ReceiptText className="mx-auto h-7 w-7 text-brand" />
            <p className="mt-3 text-sm font-semibold text-foreground">עדיין לא חובר אמצעי תשלום</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              בשלב החיוב נוסיף כאן אמצעי תשלום, חשבוניות והגדרות חיוב בהתאם לספק שייבחר.
            </p>
          </div>
        </AccountSectionCard>
      </div>
    </>
  );
}
