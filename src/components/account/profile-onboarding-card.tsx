import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Circle,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  MailCheck,
  Pause,
  Play,
  Rocket,
  UserRoundCheck,
  UserRoundPen,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { OnboardingStepState, ProfileOnboardingStatus } from "@/lib/profile-onboarding";

type StepRoute = "profile" | "credentials" | "leads" | "billing" | null;
type ManagementAction = "publish" | "freeze" | "activate";

type Step = {
  id: keyof ProfileOnboardingStatus["steps"];
  title: string;
  description: string;
  action: string | null;
  route: StepRoute;
  icon: typeof UserRoundCheck;
};

export function ProfileOnboardingCard({
  status,
  actionPending,
  onPublish,
  onVisibilityChange,
}: {
  status: ProfileOnboardingStatus;
  actionPending: boolean;
  onPublish: () => Promise<unknown>;
  onVisibilityChange: (visible: boolean) => Promise<unknown>;
}) {
  const [managementAction, setManagementAction] = useState<ManagementAction | null>(null);
  const steps = useMemo(() => buildSteps(status), [status]);
  const progress = (status.completedCount / status.totalCount) * 100;
  const billingNeedsAction = status.paymentMethodStatus !== "active";
  const paymentRepairOnly =
    billingNeedsAction &&
    (Object.entries(status.steps) as Array<[keyof ProfileOnboardingStatus["steps"], OnboardingStepState]>).every(
      ([id, state]) => id === "payment" || state === "complete",
    );
  const displayedSteps = paymentRepairOnly ? steps.filter((step) => step.id === "payment") : steps;
  const compact = !billingNeedsAction && (status.allStepsComplete || status.isPublished);

  async function confirmManagementAction() {
    if (!managementAction) return;
    try {
      if (managementAction === "publish") await onPublish();
      else await onVisibilityChange(managementAction === "activate");
      setManagementAction(null);
    } catch {
      // The owning mutation displays the actionable error and keeps the dialog open.
    }
  }

  if (compact) {
    const frozen = status.isPublished && status.visibility === "hidden";
    const readyToPublish = !status.isPublished;
    const budgetPaused = status.isPublished && status.isBudgetPaused;
    const paused = status.isPublished && !status.isPublic && !frozen && !budgetPaused;
    const profileState = readyToPublish
      ? "ready"
      : frozen
        ? "frozen"
        : budgetPaused
          ? "budget"
          : paused
            ? "paused"
            : "active";
    const stateCopy = {
      ready: {
        badge: "מוכן לפרסום",
        badgeClass: "border-sky-200 bg-sky-50 text-sky-800",
        description: "הפרופיל מוכן. נדרש אישור סופי כדי להציג אותו באתר ולהתחיל לקבל פניות.",
      },
      active: {
        badge: "פעיל",
        badgeClass: "border-emerald-300 bg-white/80 text-emerald-800",
        description: "הפרופיל פעיל, מופיע באתר ומוכן לקבל פניות חדשות.",
      },
      frozen: {
        badge: "מוקפא",
        badgeClass: "border-slate-300 bg-white/80 text-slate-700",
        description: "הפרופיל שמור אך אינו מופיע באתר ואינו מקבל פניות חדשות.",
      },
      budget: {
        badge: "התקציב החודשי נוצל",
        badgeClass: "border-amber-300 bg-amber-50 text-amber-800",
        description: "הפרופיל אינו מופיע בחיפושים עד תחילת החודש הבא. אפשר להגדיל את התקציב במסך החיובים.",
      },
      paused: {
        badge: "מושהה",
        badgeClass: "border-amber-300 bg-amber-50 text-amber-800",
        description: "הפרופיל אינו מופיע כעת באתר. ניתן לנסות להפעילו מחדש לאחר הסדרת החסימה.",
      },
    } as const;
    const copy = stateCopy[profileState];

    return (
      <>
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/85 px-4 py-3 shadow-card sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
                <Check className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-emerald-950">כל חמשת השלבים הושלמו</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${copy.badgeClass}`}>
                    {copy.badge}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-emerald-900/80">{copy.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {status.isPublic && status.profileSlug && (
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link
                    to="/therapists/$slug"
                    params={{ slug: status.profileSlug }}
                    search={{}}
                    target="_blank"
                    rel="noreferrer"
                  >
                    פתיחת הפרופיל
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              {readyToPublish ? (
                <Button type="button" size="sm" disabled={actionPending} onClick={() => setManagementAction("publish")}>
                  <Rocket className="h-4 w-4" />
                  פרסום הפרופיל
                </Button>
              ) : budgetPaused ? (
                <Button type="button" size="sm" asChild>
                  <Link to="/account/billing">
                    <CreditCard className="h-4 w-4" />
                    עדכון התקציב
                  </Link>
                </Button>
              ) : frozen || paused ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={actionPending}
                  onClick={() => setManagementAction("activate")}
                >
                  <Play className="h-4 w-4" />
                  הפעלת הפרופיל
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={actionPending}
                  onClick={() => setManagementAction("freeze")}
                >
                  <Pause className="h-4 w-4" />
                  הקפאת הפרופיל
                </Button>
              )}
            </div>
          </div>
        </section>

        <ManagementActionDialog
          action={managementAction}
          pending={actionPending}
          onOpenChange={(open) => !open && !actionPending && setManagementAction(null)}
          onConfirm={() => void confirmManagementAction()}
        />
      </>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand/25 bg-surface-elevated shadow-card">
      <div className="border-b border-border/70 bg-brand-soft/35 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">השלמת ההצטרפות</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">
              {paymentRepairOnly ? "נדרש להסדיר את אמצעי התשלום" : "הכנת הפרופיל לפרסום"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {paymentRepairOnly
                ? "ארבעת השלבים הראשונים כבר הושלמו. אפשר לעבור ישירות למסך החיובים כדי להשלים מחדש את השלב החמישי."
                : "כדי להתחיל להופיע באתר יש להשלים את כל השלבים"}
            </p>
          </div>
          <span className="rounded-full border border-brand/20 bg-white px-3 py-1.5 text-sm font-bold text-brand ltr-num">
            {status.completedCount}/{status.totalCount}
          </span>
        </div>
        <Progress value={progress} className="mt-4 h-2.5 bg-brand/15 [&>div]:bg-emerald-600" />
      </div>

      <ol className="divide-y divide-border/70 px-4 sm:px-6">
        {displayedSteps.map((step, index) => (
          <OnboardingStep
            key={step.id}
            number={step.id === "payment" ? 5 : index + 1}
            step={step}
            state={status.steps[step.id]}
          />
        ))}
      </ol>

      <div className="border-t border-border/70 bg-muted/20 px-4 py-4 sm:px-6">
        {paymentRepairOnly || (status.isPublished && billingNeedsAction) ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>הופעת הפרופיל הושהתה עד לעדכון אמצעי התשלום. יתר נתוני הפרופיל נשמרו ללא שינוי.</p>
          </div>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            עם השלמת כל השלבים, תופיע כאן האפשרות לפרסם את הפרופיל
          </p>
        )}
      </div>
    </section>
  );
}

function ManagementActionDialog({
  action,
  pending,
  onOpenChange,
  onConfirm,
}: {
  action: ManagementAction | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const copy = {
    publish: {
      title: "פרסום הפרופיל",
      description:
        "הפרופיל יהפוך לגלוי באתר ויוכל לקבל פניות חדשות. פניות שיימסרו בהתאם לתנאי השירות עשויות ליצור חיוב.",
      confirm: "כן, לפרסם את הפרופיל",
    },
    freeze: {
      title: "הקפאת הפרופיל",
      description:
        "הפרופיל יוסר מהאתר ולא יקבל פניות או חיובים חדשים. התוכן, הפניות והיסטוריית החיובים יישמרו וניתן יהיה להפעילו מחדש.",
      confirm: "כן, להקפיא את הפרופיל",
    },
    activate: {
      title: "הפעלת הפרופיל מחדש",
      description: "הפרופיל יחזור להופיע באתר ויוכל לקבל פניות חדשות. ההפעלה תתאפשר רק כאשר אמצעי התשלום תקין.",
      confirm: "כן, להפעיל את הפרופיל",
    },
  } as const;
  const selected = action ? copy[action] : null;

  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{selected?.title}</DialogTitle>
          <DialogDescription className="leading-6">{selected?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {pending ? "מעדכן…" : selected?.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OnboardingStep({ number, step, state }: { number: number; step: Step; state: OnboardingStepState }) {
  const Icon = step.icon;
  const content = (
    <div className="flex items-start gap-3 py-4">
      <span
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${
          state === "complete"
            ? "border-emerald-600 bg-emerald-600 text-white"
            : state === "action_required"
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-border bg-white text-muted-foreground"
        }`}
      >
        {state === "complete" ? (
          <Check className="h-4 w-4" />
        ) : state === "action_required" ? (
          <X className="h-4 w-4" />
        ) : (
          number
        )}
      </span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{step.title}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              state === "complete"
                ? "bg-emerald-100 text-emerald-800"
                : state === "action_required"
                  ? "bg-red-50 text-red-700"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {state === "complete" ? (
              <Check className="h-3 w-3" />
            ) : state === "action_required" ? (
              <X className="h-3 w-3" />
            ) : (
              <Circle className="h-2.5 w-2.5" />
            )}
            {state === "complete" ? "הושלם" : state === "action_required" ? "נדרשת פעולה" : "טרם הושלם"}
          </span>
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{step.description}</span>
        {step.action && step.route && state !== "complete" && (
          <span className="mt-2 inline-block text-xs font-semibold text-brand underline-offset-4 group-hover:underline">
            {step.action}
          </span>
        )}
      </span>
    </div>
  );

  if (!step.route || state === "complete") return <li>{content}</li>;
  return (
    <li>
      <StepLink route={step.route}>{content}</StepLink>
    </li>
  );
}

function StepLink({ route, children }: { route: Exclude<StepRoute, null>; children: React.ReactNode }) {
  const className =
    "group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";
  if (route === "profile") {
    return (
      <Link to="/account/profile" search={{ therapistId: undefined }} className={className}>
        {children}
      </Link>
    );
  }
  if (route === "credentials")
    return (
      <Link to="/account/credentials" className={className}>
        {children}
      </Link>
    );
  if (route === "leads")
    return (
      <Link to="/account/leads" className={className}>
        {children}
      </Link>
    );
  return (
    <Link to="/account/billing" className={className}>
      {children}
    </Link>
  );
}

function buildSteps(status: ProfileOnboardingStatus): Step[] {
  const accountTitle = status.ownershipMode === "claimed" ? "קבלת הבעלות על הפרופיל" : "פתיחת החשבון ושיוך הפרופיל";
  const accountDescription =
    status.accountStatus === "suspended"
      ? "החשבון מושהה ונדרשת בדיקה מול צוות טיפולינקס."
      : status.ownershipMode === "claimed"
        ? "הבעלות אושרה והפרופיל הקיים משויך לחשבון שלך."
        : status.ownershipMode === "self_created"
          ? "החשבון נפתח והפרופיל החדש משויך אליו."
          : "החשבון נפתח. לאחר שמירת הפרופיל הוא ישויך אליו אוטומטית.";

  const credentialCopy: Record<ProfileOnboardingStatus["credentialState"], [string, string]> = {
    not_started: ["אימות הסמכות ותארים", "העלאת מסמכים המאמתים תארים, הסמכות והכשרות מקצועיות (למי שמעוניין)"],
    submitted: ["אימות הסמכות ותארים", "המסמכים הוגשו וממתינים לבדיקה. תגית אימות תופיע רק לאחר אישור מנהל."],
    verified: ["אימות הסמכות ותארים", "המסמכים אושרו ותגית האימות יכולה להופיע בפרופיל הציבורי."],
    skipped: ["אימות הסמכות ותארים", "בחרת להמשיך ללא אימות מקצועי, ולכן לא תוצג תגית אימות בפרופיל."],
    action_required: ["אימות הסמכות ותארים", "נדרש להעלות מסמך מעודכן או לתקן את פרטי ההסמכה."],
  };

  const paymentCopy: Record<ProfileOnboardingStatus["paymentMethodStatus"], string> = {
    not_configured: "יש להוסיף אמצעי תשלום כדי להשלים את ההצטרפות ולפרסם את הפרופיל.",
    active: "אמצעי התשלום תקין ופעיל.",
    action_required: "אמצעי התשלום דורש עדכון כדי לחדש את הופעת הפרופיל.",
    expired: "תוקף אמצעי התשלום פג ויש לעדכן אותו כדי לחדש את הופעת הפרופיל.",
  };

  return [
    {
      id: "account",
      title: accountTitle,
      description: accountDescription,
      action: null,
      route: null,
      icon: UserRoundCheck,
    },
    {
      id: "profile",
      title: "עריכת הפרופיל המקצועי",
      description: "הפרטים האישיים והמקצועיים שיוצגו לכל מי שיצפה בפרופיל שלכם",
      action: "לעריכת הפרופיל",
      route: "profile",
      icon: UserRoundPen,
    },
    {
      id: "credentials",
      title: credentialCopy[status.credentialState][0],
      description: credentialCopy[status.credentialState][1],
      action: status.credentialState === "action_required" ? "לתיקון והעלאה מחדש" : "לניהול האימות",
      route: "credentials",
      icon: BadgeCheck,
    },
    {
      id: "contact",
      title: "בחירת דרכי התקשרות",
      description: "הגדרת הערוצים בהם אתם מעוניינים שיפנו אליכם לצורך תיאום טיפול",
      action: "להגדרת דרכי ההתקשרות",
      route: "leads",
      icon: MailCheck,
    },
    {
      id: "payment",
      title: "הוספת אמצעי תשלום",
      description: paymentCopy[status.paymentMethodStatus],
      action:
        status.paymentMethodStatus === "expired" || status.paymentMethodStatus === "action_required"
          ? "לעדכון אמצעי התשלום"
          : "למסך החיובים",
      route: "billing",
      icon: CreditCard,
    },
  ];
}
