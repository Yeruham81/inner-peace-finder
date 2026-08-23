import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronDown,
  Circle,
  CreditCard,
  ExternalLink,
  MailCheck,
  UserRoundCheck,
  UserRoundPen,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { OnboardingStepState, ProfileOnboardingStatus } from "@/lib/profile-onboarding";

type StepRoute = "profile" | "credentials" | "settings" | "billing" | null;

type Step = {
  id: keyof ProfileOnboardingStatus["steps"];
  title: string;
  description: string;
  action: string | null;
  route: StepRoute;
  icon: typeof UserRoundCheck;
};

export function ProfileOnboardingCard({ status }: { status: ProfileOnboardingStatus }) {
  const showPublishedConfirmation = status.allStepsComplete && status.isPublic;
  const [expanded, setExpanded] = useState(!showPublishedConfirmation);

  useEffect(() => {
    setExpanded(!showPublishedConfirmation);
  }, [showPublishedConfirmation]);

  const steps = useMemo(() => buildSteps(status), [status]);
  const progress = (status.completedCount / status.totalCount) * 100;

  if (showPublishedConfirmation && !expanded) {
    const claimed = status.ownershipMode === "claimed";
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
              <Check className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-emerald-950">
                {claimed ? "השלמת את תהליך ההצטרפות" : "הפרופיל פורסם בהצלחה"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                {claimed
                  ? "הפרופיל שלך פעיל ומוכן לקבל פניות חדשות."
                  : "הפרופיל שלך פעיל, מופיע באתר ומוכן לקבל פניות."}
              </p>
              {status.profileSlug && (
                <Link
                  to="/therapists/$slug"
                  params={{ slug: status.profileSlug }}
                  search={{}}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
                >
                  צפייה בפרופיל באתר
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            הצגת שלבי ההצטרפות
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand/25 bg-surface-elevated shadow-card">
      <div className="border-b border-border/70 bg-brand-soft/35 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">השלמת ההצטרפות</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">הכנת הפרופיל לפרסום</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              כל שלב שהושלם מסומן בירוק. אפשר ללחוץ על שלב שעדיין דורש פעולה ולעבור ישירות למסך המתאים.
            </p>
          </div>
          <span className="rounded-full border border-brand/20 bg-white px-3 py-1.5 text-sm font-bold text-brand ltr-num">
            {status.completedCount}/{status.totalCount}
          </span>
        </div>
        <Progress value={progress} className="mt-4 h-2.5 bg-brand/15 [&>div]:bg-emerald-600" />
      </div>

      <ol className="divide-y divide-border/70 px-4 sm:px-6">
        {steps.map((step, index) => (
          <OnboardingStep key={step.id} number={index + 1} step={step} state={status.steps[step.id]} />
        ))}
      </ol>

      <div className="border-t border-border/70 bg-muted/20 px-4 py-4 sm:px-6">
        {status.allStepsComplete && !status.isPublished ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">כל שלבי ההצטרפות הושלמו</p>
              <p className="mt-1 text-xs text-muted-foreground">נשאר לאשר את פרסום הפרופיל במסך העריכה.</p>
            </div>
            <Button asChild>
              <Link to="/account/profile" search={{ therapistId: undefined }}>
                מעבר לפרסום הפרופיל
              </Link>
            </Button>
          </div>
        ) : status.isBillingPaused ? (
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>הופעת הפרופיל הושהתה עד לעדכון אמצעי התשלום. יתר נתוני הפרופיל נשמרו ללא שינוי.</p>
          </div>
        ) : status.isPublished && status.profileSlug ? (
          <Link
            to="/therapists/$slug"
            params={{ slug: status.profileSlug }}
            search={{}}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand underline-offset-4 hover:underline"
          >
            צפייה בפרופיל באתר
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            הפרופיל יפורסם רק לאחר השלמת כל השלבים ואישור מפורש במסך עריכת הפרופיל.
          </p>
        )}
      </div>
    </section>
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
              ? "border-amber-300 bg-amber-100 text-amber-900"
              : "border-border bg-white text-muted-foreground"
        }`}
      >
        {state === "complete" ? (
          <Check className="h-4 w-4" />
        ) : state === "action_required" ? (
          <AlertTriangle className="h-4 w-4" />
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
                  ? "bg-amber-100 text-amber-900"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {state === "complete" ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
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
  if (route === "settings")
    return (
      <Link to="/account/settings" className={className}>
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
    not_started: ["אימות הסמכות ותארים", "יש להעלות מסמך לאימות או לבחור להמשיך ללא אימות מקצועי."],
    submitted: ["אימות הסמכות ותארים", "המסמכים הוגשו וממתינים לבדיקה. תגית אימות תופיע רק לאחר אישור מנהל."],
    verified: ["אימות הסמכות ותארים", "המסמכים אושרו ותגית האימות יכולה להופיע בפרופיל הציבורי."],
    skipped: ["אימות הסמכות ותארים", "בחרת להמשיך ללא אימות מקצועי, ולכן לא תוצג תגית אימות בפרופיל."],
    action_required: ["אימות הסמכות ותארים", "נדרש להעלות מסמך מעודכן או לתקן את פרטי ההסמכה."],
  };

  const paymentCopy: Record<ProfileOnboardingStatus["paymentMethodStatus"], string> = {
    not_configured: "מערכת החיוב טרם חוברה, ולכן עדיין אי אפשר להשלים את השלב הזה.",
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
      description: "השלמת פרטי המקצוע, הניסיון, התיאור, האוכלוסיות והמיקומים הנדרשים לפרסום.",
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
      title: "הגדרת דרכי התקשרות",
      description: "בחירת הערוצים לקבלת פניות והזנת הפרטים הנדרשים לכל ערוץ.",
      action: "להגדרת דרכי ההתקשרות",
      route: "settings",
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
