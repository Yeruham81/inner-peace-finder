import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSectionCard } from "@/components/account/account-section-card";
import { AccountStatCard } from "@/components/account/account-stat-card";
import { ACCOUNT_MOCK_TRANSACTIONS } from "@/components/account/account-mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { getMyMonthlyBudget, setMyTestPaymentMethod, updateMyMonthlyBudget } from "@/lib/billing-budget.functions";
import { accountChannelLabel, formatAccountActivityDate, formatAgorot, shortActivityId } from "@/lib/account-activity";
import { getMyBillingTransactions } from "@/lib/account-activity.functions";
import { getMyProfileOnboarding } from "@/lib/profile-onboarding.functions";

export const Route = createFileRoute("/_authenticated/account/billing")({
  head: () => ({
    meta: [{ title: "חיובים | החשבון שלי | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountBillingPage,
});

function AccountBillingPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const getOnboardingFn = useServerFn(getMyProfileOnboarding);
  const getMonthlyBudgetFn = useServerFn(getMyMonthlyBudget);
  const getBillingTransactionsFn = useServerFn(getMyBillingTransactions);
  const updateMonthlyBudgetFn = useServerFn(updateMyMonthlyBudget);
  const setTestPaymentFn = useServerFn(setMyTestPaymentMethod);
  const onboarding = useQuery({
    queryKey: ["profile-onboarding"],
    queryFn: () => getOnboardingFn(),
  });
  const budget = useQuery({
    queryKey: ["my-monthly-budget"],
    queryFn: () => getMonthlyBudgetFn(),
  });
  const billingHistory = useQuery({
    queryKey: ["my-billing-transactions"],
    queryFn: () => getBillingTransactionsFn(),
  });
  const paymentMethodStatus = onboarding.data?.paymentMethodStatus ?? "not_configured";
  const paymentMethodKind = onboarding.data?.paymentMethodKind ?? "none";
  const isAdmin = user.app_metadata?.tipulinks_role === "admin";
  const [hasMonthlyLimit, setHasMonthlyLimit] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [notifyOnExhaustion, setNotifyOnExhaustion] = useState(true);
  const [showExampleHistory, setShowExampleHistory] = useState(false);

  useEffect(() => {
    if (!budget.data) return;
    setHasMonthlyLimit(budget.data.monthly_limit_agorot !== null);
    setMonthlyLimit(budget.data.monthly_limit_agorot === null ? "" : String(budget.data.monthly_limit_agorot / 100));
    setNotifyOnExhaustion(budget.data.notify_on_exhaustion);
  }, [budget.data]);

  const budgetMutation = useMutation({
    mutationFn: () => {
      const amount = Number(monthlyLimit);
      const agorot = hasMonthlyLimit ? Math.round(amount * 100) : null;
      if (hasMonthlyLimit && (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(agorot))) {
        throw new Error("יש להזין תקציב חודשי תקין וגדול מאפס.");
      }
      return updateMonthlyBudgetFn({
        data: { monthlyLimitAgorot: agorot, notifyOnExhaustion },
      });
    },
    onSuccess: (snapshot) => {
      queryClient.setQueryData(["my-monthly-budget"], snapshot);
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding"] });
      toast.success("התקציב החודשי נשמר.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לשמור את התקציב."),
  });

  const testPaymentMutation = useMutation({
    mutationFn: (enabled: boolean) => setTestPaymentFn({ data: { enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["therapist-account"] });
      toast.success(paymentMethodKind === "test" ? "אמצעי התשלום לבדיקה הוסר." : "אמצעי התשלום לבדיקה הופעל.");
    },
    onError: (error: Error) => toast.error(error.message || "לא ניתן לעדכן את מצב הבדיקה."),
  });

  const spent = budget.data?.spent_agorot ?? 0;
  const limit = budget.data?.monthly_limit_agorot ?? null;
  const usagePercent = limit ? Math.min(100, (spent / limit) * 100) : 0;
  const chargedLeads = billingHistory.data?.charged_leads ?? 0;
  const averageCharge = chargedLeads ? Math.round(spent / chargedLeads) : 0;
  const remainingBudget = budget.data?.remaining_agorot ?? null;
  const transactionRows = showExampleHistory
    ? ACCOUNT_MOCK_TRANSACTIONS.map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        type: transaction.type,
        amountAgorot: transaction.amount * 100,
      }))
    : (billingHistory.data?.transactions ?? []).map((transaction) => {
        const timestamp = formatAccountActivityDate(transaction.created_at);
        const leadId = transaction.lead_id ? shortActivityId(transaction.lead_id, "L") : null;
        return {
          id: shortActivityId(transaction.id, "TX"),
          date: `${timestamp.date} · ${timestamp.time}`,
          description: `חיוב עבור פנייה ב-${accountChannelLabel(transaction.channel)}${leadId ? ` · ${leadId}` : ""}`,
          type: "חיוב" as const,
          amountAgorot: transaction.amount_agorot,
        };
      });

  return (
    <>
      <AccountPageHeader
        eyebrow="כספים"
        title="חיובים"
        description="מעקב אחר חיובים עבור פניות, ניצול התקציב ותנועות שנרשמו בחשבון. מנגנון הסליקה עצמו יחובר בשלב מאוחר יותר."
        action={
          showExampleHistory ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-100">
              דוגמת היסטוריה
            </Badge>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AccountStatCard
          label="חיוב החודש"
          value={formatAgorot(spent)}
          detail={`${chargedLeads.toLocaleString("he-IL")} פניות שחויבו`}
          icon={CreditCard}
        />
        <AccountStatCard
          label="פניות שחויבו"
          value={chargedLeads.toLocaleString("he-IL")}
          detail="בחודש הקלנדרי הנוכחי"
          icon={ReceiptText}
        />
        <AccountStatCard
          label="עלות ממוצעת לפנייה"
          value={formatAgorot(averageCharge)}
          detail="לפי חיובי החודש"
          icon={CircleDollarSign}
        />
        <AccountStatCard
          label="נותר בתקציב"
          value={remainingBudget === null ? "ללא הגבלה" : formatAgorot(remainingBudget)}
          detail={limit === null ? "לא הוגדרה תקרה חודשית" : `מתוך ${formatAgorot(limit)}`}
          icon={WalletCards}
        />
      </div>

      <div className="mt-6">
        <AccountSectionCard title="תקציב פרסום חודשי" description="הגדרת תקרה לחיובים עבור פניות בכל חודש קלנדרי.">
          {budget.isLoading ? (
            <p className="text-sm text-muted-foreground">טוען את הגדרות התקציב…</p>
          ) : budget.isError ? (
            <p className="text-sm text-destructive">לא ניתן לטעון את התקציב החודשי.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
              <div className="space-y-5">
                {budget.data?.is_budget_paused && (
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-sm font-semibold">הפרופיל אינו מוצג עקב ניצול התקציב</p>
                      <p className="mt-1 text-xs leading-5 text-amber-900/80">
                        החשיפה תחודש אוטומטית בתחילת החודש הבא, או מיד לאחר הגדלת התקציב לסכום שמאפשר חיוב של פנייה
                        נוספת.
                      </p>
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                  <span>
                    <span className="block text-sm font-semibold text-foreground">הגבלת החיוב החודשי</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      בכיבוי ההגבלה לא תהיה תקרת תקציב חודשית.
                    </span>
                  </span>
                  <Switch checked={hasMonthlyLimit} onCheckedChange={setHasMonthlyLimit} />
                </label>

                {hasMonthlyLimit && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-foreground">תקרה חודשית בשקלים</span>
                    <div className="relative max-w-xs">
                      <span className="absolute inset-y-0 right-3 grid place-items-center text-sm text-muted-foreground">
                        ₪
                      </span>
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        type="number"
                        min="1"
                        step="0.01"
                        value={monthlyLimit}
                        onChange={(event) => setMonthlyLimit(event.target.value)}
                        className="pr-8 text-left ltr-num"
                        placeholder="500"
                      />
                    </div>
                  </label>
                )}

                <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                  <span>
                    <span className="block text-sm font-semibold text-foreground">התראה כשהתקציב נוצל</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      תישלח הודעת אימייל עם קישור מהיר להגדלת התקציב.
                    </span>
                  </span>
                  <Switch checked={notifyOnExhaustion} onCheckedChange={setNotifyOnExhaustion} />
                </label>

                <Button type="button" disabled={budgetMutation.isPending} onClick={() => budgetMutation.mutate()}>
                  {budgetMutation.isPending ? "שומר…" : "שמירת התקציב"}
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-muted/25 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">ניצול החודש</span>
                  <span className="font-bold text-foreground ltr-num">{formatAgorot(spent)}</span>
                </div>
                {limit !== null ? (
                  <>
                    <Progress value={usagePercent} className="mt-4 h-2.5" />
                    <div className="mt-3 flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>נותרו {formatAgorot(budget.data?.remaining_agorot ?? 0)}</span>
                      <span>מתוך {formatAgorot(limit)}</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">לא הוגדרה תקרת תקציב חודשית.</p>
                )}
                <div className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                  <p>
                    מחיר לפנייה:{" "}
                    {budget.data?.pricing_active ? formatAgorot(budget.data.lead_price_agorot ?? 0) : "טרם נקבע"}
                  </p>
                  {!budget.data?.pricing_active && (
                    <p className="mt-1">
                      אפשר לשמור את התקציב כבר עכשיו. האכיפה תתחיל רק לאחר שמחיר הפנייה יוגדר ויופעל במערכת.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </AccountSectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <AccountSectionCard title="היסטוריית תנועות" description="חיובים אחרונים שנרשמו עבור פניות.">
          {showExampleHistory && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <span>זוהי המחשה בלבד. התקציב ואמצעי התשלום המוצגים בעמוד נשארים הנתונים האמיתיים שלך.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowExampleHistory(false)}>
                חזרה להיסטוריה שלי
              </Button>
            </div>
          )}
          {billingHistory.isLoading && !showExampleHistory ? (
            <p className="py-8 text-center text-sm text-muted-foreground">טוען את היסטוריית התנועות…</p>
          ) : billingHistory.isError && !showExampleHistory ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">לא ניתן לטעון את היסטוריית התנועות.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void billingHistory.refetch()}
              >
                ניסיון חוזר
              </Button>
            </div>
          ) : transactionRows.length ? (
            <div className="divide-y divide-border/70">
              {transactionRows.map((transaction) => (
                <div key={transaction.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{transaction.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {transaction.date} · <span className="ltr-num">{transaction.id}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p
                      className={`text-sm font-bold ltr-num ${transaction.type === "זיכוי" ? "text-emerald-700" : "text-foreground"}`}
                    >
                      {formatAgorot(transaction.amountAgorot)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{transaction.type}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <ReceiptText className="mx-auto h-8 w-8 text-brand" />
              <p className="mt-3 text-sm font-semibold text-foreground">עדיין לא נרשמו תנועות חיוב</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                לאחר קבלת פנייה מחויבת, פרטי התנועה יופיעו כאן באופן אוטומטי.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowExampleHistory(true)}
              >
                הצגת דוגמה
              </Button>
            </div>
          )}
        </AccountSectionCard>

        <AccountSectionCard title="אמצעי תשלום" description="יחובר יחד עם מערכת החיוב האמיתית.">
          {onboarding.isLoading ? (
            <p className="text-sm text-muted-foreground">טוען את מצב אמצעי התשלום…</p>
          ) : onboarding.isError ? (
            <p className="text-sm text-destructive">לא ניתן לטעון את מצב אמצעי התשלום.</p>
          ) : paymentMethodStatus === "active" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              {paymentMethodKind === "test" ? (
                <ShieldCheck className="mx-auto h-7 w-7 text-violet-700" />
              ) : (
                <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" />
              )}
              <p className="mt-3 text-sm font-semibold text-emerald-950">
                {paymentMethodKind === "test" ? "אמצעי תשלום לבדיקה פעיל" : "אמצעי התשלום פעיל"}
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-900/80">
                {paymentMethodKind === "test"
                  ? "זהו סימון פנימי לפרופיל בדיקה. לא נשמרו פרטי כרטיס ולא תתבצע עסקה."
                  : "אמצעי התשלום תקין ושלב החיוב בתהליך ההצטרפות הושלם."}
              </p>
              {isAdmin && paymentMethodKind === "test" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  disabled={testPaymentMutation.isPending}
                  onClick={() => testPaymentMutation.mutate(false)}
                >
                  הסרת אמצעי התשלום לבדיקה
                </Button>
              )}
            </div>
          ) : paymentMethodStatus === "expired" || paymentMethodStatus === "action_required" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
              <AlertTriangle className="mx-auto h-7 w-7 text-amber-700" />
              <p className="mt-3 text-sm font-semibold text-amber-950">נדרש לעדכן את אמצעי התשלום</p>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                הופעת הפרופיל מושהית עד לעדכון אמצעי התשלום. אפשרות העדכון תופעל לאחר חיבור ספק החיוב.
              </p>
              {isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  disabled={testPaymentMutation.isPending}
                  onClick={() => testPaymentMutation.mutate(true)}
                >
                  <ShieldCheck className="h-4 w-4" />
                  הפעלת אמצעי תשלום לבדיקה
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
              <ReceiptText className="mx-auto h-7 w-7 text-brand" />
              <p className="mt-3 text-sm font-semibold text-foreground">עדיין לא חובר אמצעי תשלום</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                בשלב החיוב נוסיף כאן אמצעי תשלום, חשבוניות והגדרות חיוב בהתאם לספק שייבחר. עד אז שלב זה יישאר פתוח.
              </p>
              {isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  disabled={testPaymentMutation.isPending}
                  onClick={() => testPaymentMutation.mutate(true)}
                >
                  <ShieldCheck className="h-4 w-4" />
                  הפעלת אמצעי תשלום לבדיקה
                </Button>
              )}
            </div>
          )}
        </AccountSectionCard>
      </div>
    </>
  );
}
