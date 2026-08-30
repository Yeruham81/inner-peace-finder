import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createWhatsAppLead } from "@/lib/whatsapp-lead.functions";
import { issueLeadChallenge } from "@/lib/lead-challenge.functions";
import { track } from "@/lib/analytics";
import { looksLikeIsraeliPhone } from "@/lib/phone-il";
import { CHALLENGE_ERROR_MESSAGES } from "@/components/lead-modal";

type Challenge = { id: string; prompt: string };

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20.5 11.9a8.5 8.5 0 0 1-12.6 7.45L3.5 20.5l1.17-4.25A8.5 8.5 0 1 1 20.5 11.9Z" />
      <path d="M8.15 7.65c.18-.4.38-.41.58-.42h.5c.16 0 .42.06.64.53.22.48.76 1.86.83 2 .07.15.12.32.02.51-.1.2-.15.32-.3.49-.15.17-.31.37-.44.5-.15.15-.3.31-.13.61.17.3.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.44.3.15.47.13.64-.08.17-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.72.81 2.02.96.3.15.49.22.57.35.07.12.07.72-.17 1.42-.25.7-1.43 1.34-1.97 1.43-.5.08-1.14.12-1.84-.1-.42-.13-.96-.31-1.65-.61a12.7 12.7 0 0 1-4.83-4.27c-.13-.17-1.18-1.57-1.18-3 0-1.42.75-2.13 1.02-2.42Z" />
    </svg>
  );
}

function defaultMessage(problemName?: string | null, populationName?: string | null): string {
  const base = "היי, הגעתי אליך דרך טיפולינקס.";
  if (problemName && populationName) {
    return `${base}\nאני מחפש/ת עזרה בנושא ${problemName} ל${populationName} ואשמח לשוחח.`;
  }
  if (problemName) return `${base}\nאני מחפש/ת עזרה בנושא ${problemName} ואשמח לשוחח.`;
  return `${base}\nאשמח לשוחח על האפשרות לטיפול.`;
}

function isChallengeAnswerCorrect(prompt: string, answer: number): boolean {
  const match = /^(\d+)\s*([+-])\s*(\d+)$/.exec(prompt.trim());
  if (!match) return false;
  const left = Number(match[1]);
  const right = Number(match[3]);
  return answer === (match[2] === "+" ? left + right : left - right);
}

/**
 * WhatsApp lead dialog.
 *
 * The visitor stays inside Tipulinks: no WhatsApp app, no deep link and no
 * therapist phone number ever reaches the browser. Tipulinks sends the message
 * to the therapist server-side.
 */
export function WhatsAppLeadModal({
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
  pageSource?: string | null;
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

  const handleCloseRequest = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

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
    void requestChallenge();
    setTimeout(() => {
      panelRef.current?.scrollTo({ top: 0 });
      firstFieldRef.current?.focus({ preventScroll: true });
    }, 30);
  }, [open, problemName, populationName, requestChallenge]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseRequest();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCloseRequest, open]);

  const challengeAnswerNum = Number(challengeAnswer);
  const challengeOk =
    challenge !== null &&
    !challengeLoading &&
    challengeAnswer.trim() !== "" &&
    Number.isFinite(challengeAnswerNum) &&
    isChallengeAnswerCorrect(challenge.prompt, challengeAnswerNum);

  const phoneOk = looksLikeIsraeliPhone(phone);
  const nameOk = name.trim().length >= 2;
  const messageOk = message.trim().length >= 2;
  const canSubmit = nameOk && phoneOk && messageOk && challengeOk && !submitting;

  const titleId = useMemo(() => `whatsapp-lead-modal-${therapistId}`, [therapistId]);

  if (!open || typeof document === "undefined") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    track("anti_spam_passed", { therapist_id: therapistId, page_source: pageSource ?? null });
    try {
      const res = await createWhatsAppLead({
        data: {
          therapistId,
          sourceProblemId: problemId ?? null,
          populationId: populationId ?? null,
          ctaId: "whatsapp_lead",
          visitorName: name.trim(),
          visitorPhone: phone.trim(),
          message: message.trim(),
          challengeId: challenge!.id,
          challengeAnswer: challengeAnswerNum,
        },
      });

      if (!res.ok) {
        // Internal delivery/eligibility failures are intentionally hidden from
        // the visitor. From their perspective the submission is complete; they
        // can continue contacting other therapists without being exposed to
        // provider, therapist-availability or budget state.
        if (res.reason === "therapist_unavailable" || res.reason === "delivery_failed") {
          setDone(true);
          return;
        }

        if (res.reason === "rate_limit_exceeded") {
          track("lead_rate_limited", { therapist_id: therapistId, page_source: pageSource ?? null });
        }
        setError(res.message);
        if (res.reason === "challenge_failed" || res.reason === "challenge_expired") {
          setChallengeAnswer("");
          void requestChallenge();
        }
        setSubmitting(false);
        return;
      }

      track("lead_created", {
        therapist_id: therapistId,
        problem_id: problemId ?? null,
        population_id: populationId ?? null,
        page_source: pageSource ?? null,
      });
      setDone(true);
    } catch {
      // Unexpected server/provider failures are also kept internal. Do not
      // disclose whether the therapist ultimately received the WhatsApp lead.
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseRequest} aria-hidden="true" />
      <div
        ref={panelRef}
        aria-busy={submitting}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-surface-elevated p-6 shadow-card sm:max-h-[calc(100dvh-3rem)]"
      >
        {!submitting && (
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
              הפנייה נשלחה למטפל
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              הפנייה נשלחה למטפל דרך WhatsApp. אם תתקבל תשובה, היא תופיע ישירות ב-WhatsApp שלך.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              סגירה
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-foreground">
                שליחת הודעה ל{therapistName} ב־WhatsApp
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                ההודעה נשלחת מטיפולינקס ישירות למטפל/ת ב־WhatsApp. אין צורך לצאת מהאתר.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="wa-lead-name">
                שם מלא
              </label>
              <input
                id="wa-lead-name"
                ref={firstFieldRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="wa-lead-phone">
                טלפון לחזרה
              </label>
              <input
                id="wa-lead-phone"
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
              <label className="block text-sm font-medium text-foreground" htmlFor="wa-lead-msg">
                הודעה
              </label>
              <textarea
                id="wa-lead-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="wa-lead-cap">
                אימות אנושי: כמה זה{" "}
                <span dir="ltr" className="ltr-num">
                  {challenge?.prompt ?? "…"}
                </span>{" "}
                ?
              </label>
              <input
                id="wa-lead-cap"
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

            <p className="text-xs text-muted-foreground">
              הפרטים שתמלאו כאן יישלחו למטפל/ת ב־WhatsApp דרך טיפולינקס. מספר הטלפון של המטפל/ת אינו נחשף.
            </p>

            {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <WhatsAppIcon className="h-5 w-5 shrink-0" />
              <span>{submitting ? "שולח..." : "שלח הודעה בווטסאפ"}</span>
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
