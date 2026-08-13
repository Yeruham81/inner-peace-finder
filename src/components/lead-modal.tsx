import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { createLead } from "@/lib/lead.functions";
import { issueLeadChallenge } from "@/lib/lead-challenge.functions";
import { track } from "@/lib/analytics";
import { sanitizeSearchReturn } from "@/lib/search-return";

/** Time the success confirmation stays visible before returning to results. */
export const LEAD_SUCCESS_REDIRECT_MS = 1500;

const PHONE_RE = /^(\+?972|0)(5\d|[23489])\d{7,8}$/;

/** Server-issued challenge. The expected answer never reaches the browser. */
type Challenge = { id: string; prompt: string };

export const CHALLENGE_ERROR_MESSAGES = {
  failed: "האימות נכשל. נסו לפתור את התרגיל החדש.",
  expired: "תוקף האימות פג. הוצג תרגיל חדש.",
  rateLimited: "נשלחו מספר פניות בזמן קצר. ניתן לנסות שוב מאוחר יותר.",
} as const;

function defaultMessage(problemName?: string | null, populationName?: string | null): string {
  const base = "היי, הגעתי אליך דרך טיפולינקס.";
  if (problemName && populationName) {
    return `${base}\nאני מחפש/ת עזרה בנושא ${problemName} ל${populationName} ואשמח לשוחח.`;
  }
  if (problemName) {
    return `${base}\nאני מחפש/ת עזרה בנושא ${problemName} ואשמח לשוחח.`;
  }
  return `${base}\nאשמח לשוחח על האפשרות לטיפול.`;
}

export function LeadModal({
  open,
  onClose,
  therapistId,
  therapistName,
  problemId,
  problemName,
  populationId,
  populationName,
  pageSource,
}: {
  open: boolean;
  onClose: () => void;
  therapistId: string;
  therapistName: string;
  problemId?: string | null;
  problemName?: string | null;
  populationId?: string | null;
  populationName?: string | null;
  pageSource?: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(() => defaultMessage(problemName, populationName));
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const redirectedRef = useRef(false);
  const navigate = useNavigate();
  const returnTo = useRouterState({
    select: (s) => sanitizeSearchReturn((s.location.search as { ret?: unknown } | undefined)?.ret),
  });

  const returnToResults = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    setName("");
    setPhone("");
    setMessage(defaultMessage(problemName, populationName));
    setChallenge(null);
    setChallengeAnswer("");
    setError(null);
    setDone(false);
    setSubmitting(false);
    onClose();
    navigate({ href: returnTo, replace: true });
  }, [navigate, onClose, populationName, problemName, returnTo]);

  const handleCloseRequest = useCallback(() => {
    // Once submission starts, keep the dialog open until the server responds.
    if (submitting) return;
    // A close attempt after success completes the required return immediately.
    if (done) {
      returnToResults();
      return;
    }
    onClose();
  }, [done, onClose, returnToResults, submitting]);

  // Reset state on every open
  /** Ask the server for a fresh challenge; the answer stays server-side. */
  const requestChallenge = useCallback(async () => {
    setChallengeLoading(true);
    setChallengeAnswer("");
    try {
      const res = await issueLeadChallenge();
      if (res.ok) {
        setChallenge({ id: res.challengeId, prompt: res.prompt });
      } else {
        setChallenge(null);
        setError(CHALLENGE_ERROR_MESSAGES.rateLimited);
      }
    } catch {
      setChallenge(null);
      setError("אירעה שגיאה בטעינת האימות. נסו שוב.");
    } finally {
      setChallengeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setMessage(defaultMessage(problemName, populationName));
    setChallenge(null);
    setChallengeAnswer("");
    setError(null);
    setDone(false);
    setSubmitting(false);
    redirectedRef.current = false;
    void requestChallenge();
    setTimeout(() => {
      panelRef.current?.scrollTo({ top: 0 });
      firstFieldRef.current?.focus({ preventScroll: true });
    }, 30);
  }, [open, problemName, populationName, requestChallenge]);

  // Keep the profile page fixed behind the dialog while it is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseRequest();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCloseRequest, open]);

  // Redirect back to the search results only after a confirmed success. The
  // timer deliberately does not depend on `open`, so an external close request
  // cannot cancel the required return navigation.
  useEffect(() => {
    if (!done || redirectedRef.current) return;
    const timer = setTimeout(returnToResults, LEAD_SUCCESS_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [done, returnToResults]);

  const challengeAnswerNum = Number(challengeAnswer);
  const challengeOk =
    challenge !== null &&
    !challengeLoading &&
    challengeAnswer.trim() !== "" &&
    Number.isFinite(challengeAnswerNum);

  const phoneOk = PHONE_RE.test(phone.trim());
  const nameOk = name.trim().length >= 2;
  const messageOk = message.trim().length >= 2;
  const canSubmit = nameOk && phoneOk && messageOk && challengeOk && !submitting;

  const titleId = useMemo(() => `lead-modal-${therapistId}`, [therapistId]);

  if (!open || typeof document === "undefined") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    track("anti_spam_passed", { therapist_id: therapistId, page_source: pageSource ?? null });
    try {
      const res = await createLead({
        data: {
          therapistId,
          sourceProblemId: problemId ?? null,
          populationId: populationId ?? null,
          ctaId: "primary",
          visitorName: name.trim(),
          visitorPhone: phone.trim(),
          message: message.trim(),
          challengeId: challenge!.id,
          challengeAnswer: challengeAnswerNum,
        },
      });
      if (!res.ok) {
        if (res.reason === "therapist_unavailable") {
          setError(res.message ?? "לא ניתן לשלוח פנייה לפרופיל זה כרגע.");
          setSubmitting(false);
          return;
        }
        if (res.reason === "rate_limit_exceeded") {
          track("lead_rate_limited", {
            therapist_id: therapistId,
            page_source: pageSource ?? null,
          });
          setError(res.message ?? CHALLENGE_ERROR_MESSAGES.rateLimited);
          setSubmitting(false);
          return;
        }
        setError(
          res.reason === "challenge_expired"
            ? CHALLENGE_ERROR_MESSAGES.expired
            : CHALLENGE_ERROR_MESSAGES.failed,
        );
        setChallengeAnswer("");
        setSubmitting(false);
        void requestChallenge();
        return;
      }
      track("lead_created", {
        therapist_id: therapistId,
        problem_id: problemId ?? null,
        population_id: populationId ?? null,
        page_source: pageSource ?? null,
      });
      if (res.deliveryStatus === "sent") {
        track("lead_delivered", { therapist_id: therapistId, page_source: pageSource ?? null });
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה. נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseRequest} aria-hidden="true" />
      <div
        ref={panelRef}
        aria-busy={submitting}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-surface-elevated p-6 shadow-card sm:max-h-[calc(100dvh-3rem)]"
      >
        {!submitting && !done && (
          <button
            type="button"
            onClick={handleCloseRequest}
            aria-label="סגירה"
            className="absolute top-3 left-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        )}

        {done ? (
          <div role="status" aria-live="polite" className="py-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-brand-soft text-2xl leading-[3rem] text-primary">
              ✓
            </div>
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              הפנייה נשלחה
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              הפנייה נשלחה בהצלחה. ניתן להמשיך לעיין בתוצאות החיפוש ולשלוח פניות נוספות.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-foreground">
                פנייה ל{therapistName}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">מלאו פרטים והפנייה תועבר ישירות למטפל/ת.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="lead-name">
                שם מלא
              </label>
              <input
                id="lead-name"
                ref={firstFieldRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="lead-phone">
                טלפון
              </label>
              <input
                id="lead-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="05X-XXXXXXX"
                required
                dir="ltr"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
              {phone.length > 0 && !phoneOk && (
                <p className="mt-1 text-xs text-destructive">מספר טלפון ישראלי לא תקין</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="lead-msg">
                הודעה
              </label>
              <textarea
                id="lead-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="lead-cap">
                אימות אנושי: כמה זה{" "}
                <span dir="ltr" className="ltr-num">
                  {challenge?.prompt ?? "…"}
                </span>{" "}
                ?
              </label>
              <input
                id="lead-cap"
                value={challengeAnswer}
                onChange={(e) => setChallengeAnswer(e.target.value.replace(/[^\d-]/g, ""))}
                inputMode="numeric"
                required
                disabled={challengeLoading || challenge === null}
                aria-busy={challengeLoading}
                dir="ltr"
                className="mt-1 w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
            </div>

            {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "שולח..." : "שליחת פנייה"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
