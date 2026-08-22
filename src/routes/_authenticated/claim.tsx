import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, MailCheck } from "lucide-react";

import { acceptClaimInvite, getClaimInvitePreview, type ClaimInvitePreview } from "@/lib/profile-claim-v2.functions";

export const Route = createFileRoute("/_authenticated/claim")({
  validateSearch: zodValidator(
    z.object({
      token: fallback(z.string(), "").default(""),
    }),
  ),
  component: ClaimInvitePage,
});

function ClaimInvitePage() {
  const { token } = Route.useSearch();
  const previewFn = useServerFn(getClaimInvitePreview);
  const acceptFn = useServerFn(acceptClaimInvite);
  const navigate = useNavigate();
  const [preview, setPreview] = useState<ClaimInvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token || loading) return;
    setLoading(true);
    setError(null);
    try {
      setPreview(await previewFn({ data: { token } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לבדוק את ההזמנה.");
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    if (!token || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptFn({ data: { token } });
      await navigate({ to: "/account/profile", search: { therapistId: undefined } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לקבל בעלות על הפרופיל.");
    } finally {
      setAccepting(false);
    }
  }

  if (!token) {
    return (
      <ClaimCard title="קישור ההזמנה חסר">
        <p className="text-sm leading-6 text-muted-foreground">
          קבלת בעלות מתבצעת באמצעות קישור אישי שנשלח לפרט קשר שכבר היה משויך למטפל/ת.
        </p>
        <Link
          to="/account"
          className="mt-5 inline-flex rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-foreground"
        >
          חזרה לחשבון
        </Link>
      </ClaimCard>
    );
  }

  if (!preview) {
    return (
      <ClaimCard title="קבלת בעלות על פרופיל">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <KeyRound className="h-6 w-6" />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          נבדוק שההזמנה עדיין בתוקף ושכתובת האימייל של החשבון תואמת לכתובת שאליה נשלחה ההזמנה.
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <button
          onClick={() => void load()}
          disabled={loading}
          className="mt-5 w-full rounded-xl bg-brand px-5 py-3 font-semibold text-brand-foreground disabled:opacity-60"
        >
          {loading ? "בודק…" : "בדיקת ההזמנה"}
        </button>
      </ClaimCard>
    );
  }

  if (!preview.valid) {
    return (
      <ClaimCard title="ההזמנה אינה זמינה">
        <p className="text-sm leading-6 text-muted-foreground">ייתכן שהקישור פג, בוטל או כבר נוצל.</p>
      </ClaimCard>
    );
  }

  return (
    <ClaimCard title="קבלת בעלות על הפרופיל">
      <div className="rounded-2xl border border-border bg-background p-4">
        <p className="text-lg font-bold">{preview.therapistName ?? "פרופיל מטפל/ת"}</p>
        {preview.professionalTitle && <p className="mt-1 text-sm text-muted-foreground">{preview.professionalTitle}</p>}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-muted/60 p-4 text-sm">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold">אימות באמצעות האימייל הקיים</p>
          <p className="mt-1 leading-6 text-muted-foreground">
            ההזמנה נשלחה ל־{preview.maskedEmail ?? "כתובת המקושרת לפרופיל"}.
          </p>
        </div>
      </div>

      {!preview.signedInEmailVerified ? (
        <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-6 text-destructive">
          יש לאמת את כתובת האימייל של החשבון לפני קבלת הבעלות. לאחר האימות יש לפתוח שוב את קישור ההזמנה.
        </p>
      ) : !preview.emailMatchesSignedInUser ? (
        <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-6 text-destructive">
          כתובת האימייל של החשבון המחובר אינה תואמת לכתובת שאליה נשלחה ההזמנה. יש להתחבר באמצעות אותה כתובת אימייל.
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          בלחיצה על הכפתור מטה הפרופיל ישויך לחשבון שלך, ותינתן הסכמה מפורשת להמשך הצגתו בטיפולינקס ולקבלת פניות דרך
          המערכת. אימות הבעלות אינו מעניק תג אימות מקצועי. מומלץ לעבור על המידע שנאסף ממקורות פומביים ולעדכן אותו מיד
          לאחר מכן.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <button
        onClick={() => void accept()}
        disabled={!preview.emailMatchesSignedInUser || accepting}
        className="mt-5 w-full rounded-xl bg-brand px-5 py-3 font-semibold text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {accepting ? "משייך את הפרופיל…" : "קבלת בעלות וניהול הפרופיל"}
      </button>
    </ClaimCard>
  );
}

function ClaimCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-[70vh] bg-brand-soft/30 px-4 py-10" dir="rtl">
      <section className="mx-auto w-full max-w-lg rounded-3xl border border-border bg-surface-elevated p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
        <div className="mt-5">{children}</div>
      </section>
    </main>
  );
}
