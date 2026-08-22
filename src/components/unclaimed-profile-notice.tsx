import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, UserRoundCheck, X } from "lucide-react";

import { submitPublicProfileRequest, type ProfileRequestType } from "@/lib/profile-claim-v2.functions";

export function UnclaimedProfileNotice({ therapistId, therapistName }: { therapistId: string; therapistName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-950 sm:px-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-6">פרופיל זה נוצר על בסיס מידע פומבי וטרם עודכן על ידי המטפל/ת.</p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline"
            >
              <UserRoundCheck className="h-4 w-4" aria-hidden />
              זה הפרופיל שלך? צרו איתנו קשר
            </button>
          </div>
        </div>
      </div>

      {open && (
        <ProfileRequestDialog therapistId={therapistId} therapistName={therapistName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ProfileRequestDialog({
  therapistId,
  therapistName,
  onClose,
}: {
  therapistId: string;
  therapistName: string;
  onClose: () => void;
}) {
  const submitRequest = useServerFn(submitPublicProfileRequest);
  const [requestType, setRequestType] = useState<ProfileRequestType>("claim_profile");
  const [name, setName] = useState(therapistName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await submitRequest({
        data: {
          therapistId,
          requestType,
          requesterName: name,
          requesterEmail: email,
          requesterPhone: phone || undefined,
          note: note || undefined,
        },
      });
      if (!result.ok) {
        setError(
          result.reason === "rate_limited"
            ? "נשלחו מספר בקשות בזמן קצר. ניתן לנסות שוב מאוחר יותר."
            : "לא ניתן להגיש בקשה עבור פרופיל זה כרגע.",
        );
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה בשליחת הבקשה.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/50" aria-label="סגירה" onClick={onClose} />
      <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface-elevated p-5 shadow-card sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="סגירה"
        >
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-xl text-primary">
              ✓
            </div>
            <h2 className="mt-4 text-xl font-bold">הבקשה התקבלה</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              נבדוק את הבקשה וניצור קשר לפי הצורך. הפרטים שמילאת אינם משמשים כשלעצמם לאימות זהות.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-foreground"
            >
              סגירה
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="pr-1">
              <h2 className="text-xl font-bold">
                {requestType === "claim_profile"
                  ? `קבלת בעלות על הפרופיל של ${therapistName}`
                  : `בקשת הסרת הפרופיל של ${therapistName}`}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {requestType === "claim_profile"
                  ? "לאחר בדיקת הבקשה נשלח קישור אישי לכתובת האימייל המקצועית שכבר מקושרת לפרופיל."
                  : "אין צורך להירשם. ההסרה תתבצע לאחר שנאמת שהבקשה אכן נשלחה על ידי המטפל/ת."}
              </p>
            </div>

            {requestType === "remove_profile" && (
              <button
                type="button"
                onClick={() => setRequestType("claim_profile")}
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                חזרה לקבלת בעלות על הפרופיל
              </button>
            )}

            <Field label="שם מלא">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5"
              />
            </Field>
            <Field label="אימייל לחזרה">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-left"
              />
            </Field>
            <Field label="טלפון (אופציונלי)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-left"
              />
            </Field>
            <Field label="הערה (אופציונלי)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5"
              />
            </Field>

            <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
              לצורך קבלת בעלות, האימות יבוצע מול פרט קשר שהיה מקושר למטפל/ת לפני הגשת הבקשה — ולא מול כתובת חדשה שהוזנה
              בטופס זה.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              disabled={pending}
              className="w-full rounded-xl bg-brand px-5 py-3 font-semibold text-brand-foreground disabled:opacity-60"
            >
              {pending ? "שולח…" : requestType === "remove_profile" ? "שליחת בקשת הסרה" : "שליחת בקשת בעלות"}
            </button>

            {requestType === "claim_profile" && (
              <button
                type="button"
                onClick={() => setRequestType("remove_profile")}
                className="mx-auto block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                אינך מעוניין/ת שהפרופיל יופיע באתר? בקשת הסרה
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
