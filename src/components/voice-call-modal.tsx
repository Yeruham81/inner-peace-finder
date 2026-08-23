import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";

import { track } from "@/lib/analytics";
import { looksLikeIsraeliPhone } from "@/lib/phone-il";
import { issueLeadChallenge } from "@/lib/lead-challenge.functions";
import { startVoiceCall } from "@/lib/voice-call.functions";

/** Server-issued challenge. The expected answer never reaches the browser. */
type Challenge = { id: string; prompt: string };

export const VOICE_CALL_MESSAGES = {
  invalidPhone: "מספר הטלפון אינו תקין לשיחה. הזינו מספר ישראלי (נייד או קווי).",
  challengeFailed: "האימות נכשל. נסו לפתור את התרגיל החדש.",
  challengeExpired: "תוקף האימות פג. הוצג תרגיל חדש.",
  rateLimited: "בוצעו מספר בקשות בזמן קצר. נסו שוב מאוחר יותר.",
  unavailable: "האפשרות לשיחה טלפונית אינה זמינה כרגע עבור מטפל/ת זה.",
  providerError: "לא ניתן להתחיל את השיחה כרגע. נסו שוב מאוחר יותר.",
  success: "מתקשרים אליכם עכשיו. השאירו את הטלפון פנוי — לאחר שתענו נחבר אתכם למטפל/ת.",
} as const;

function isChallengeAnswerCorrect(prompt: string, answer: number): boolean {
  const match = /^(\d+)\s*([+-])\s*(\d+)$/.exec(prompt.trim());
  if (!match) return false;
  const left = Number(match[1]);
  const right = Number(match[3]);
  return answer === (match[2] === "+" ? left + right : left - right);
}

/**
 * Hebrew RTL dialog for the phone-call channel.
 *
 * The visitor supplies only their own number. The therapist's number is never
 * sent to the browser: the platform calls the visitor first and bridges the call
 * server-side, so no phone number is revealed to either side.
 */
export function VoiceCallModal({
  open,
  onClose,
  therapistId,
  therapistName,
  pageSource,
}: {
  open: boolean;
  onClose: () => void;
  therapistId: string;
  therapistName: string;
  pageSource?: string | null;
}) {
  const callFn = useServerFn(startVoiceCall);
  const [phone, setPhone] = useState("");
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
        setError(VOICE_CALL_MESSAGES.rateLimited);
      }
    } catch {
      setChallenge(null);
      setError(VOICE_CALL_MESSAGES.providerError);
    } finally {
      setChallengeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhone("");
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
  }, [open, requestChallenge]);

  const handleCloseRequest = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

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
  const canSubmit = phoneOk && challengeOk && !submitting;

  const titleId = useMemo(() => `voice-call-modal-${therapistId}`, [therapistId]);

  if (!open || typeof document === "undefined") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !challenge) return;
    setSubmitting(true);
    setError(null);
    track("anti_spam_passed", { therapist_id: therapistId, page_source: pageSource ?? null });

    try {
      const res = await callFn({
        data: {
          therapistId,
          phone: phone.trim(),
          challengeId: challenge.id,
          challengeAnswer: challengeAnswerNum,
        },
      });

      if (!res.ok) {
        if (res.reason === "invalid_phone") setError(VOICE_CALL_MESSAGES.invalidPhone);
        else if (res.reason === "rate_limit_exceeded") {
          track("lead_rate_limited", { therapist_id: therapistId, page_source: pageSource ?? null });
          setError(VOICE_CALL_MESSAGES.rateLimited);
        } else if (res.reason === "channel_unavailable") setError(VOICE_CALL_MESSAGES.unavailable);
        else if (res.reason === "challenge_expired" || res.reason === "challenge_failed") {
          setError(
            res.reason === "challenge_expired"
              ? VOICE_CALL_MESSAGES.challengeExpired
              : VOICE_CALL_MESSAGES.challengeFailed,
          );
          setChallengeAnswer("");
          void requestChallenge();
        } else setError(VOICE_CALL_MESSAGES.providerError);
        setSubmitting(false);
        return;
      }

      track("cta_clicked", {
        therapist_id: therapistId,
        page_source: pageSource ?? null,
        origin: "VoiceCallModal",
      });
      setDone(true);
    } catch {
      setError(VOICE_CALL_MESSAGES.providerError);
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      dir="rtl"
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
              ☎
            </div>
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              השיחה בדרך אליכם
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{VOICE_CALL_MESSAGES.success}</p>
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
                שיחה טלפונית עם {therapistName}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                אנחנו נתקשר אליכם קודם, ומיד לאחר שתענו נחבר אתכם למטפל/ת. מספרי הטלפון של שני הצדדים
                נשארים חסויים והשיחה אינה מוקלטת.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="voice-phone">
                הטלפון שלכם לשיחה
              </label>
              <input
                id="voice-phone"
                ref={firstFieldRef}
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
                <p className="mt-1 text-xs text-destructive">{VOICE_CALL_MESSAGES.invalidPhone}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="voice-cap">
                אימות אנושי: כמה זה{" "}
                <span dir="ltr" className="ltr-num">
                  {challenge?.prompt ?? "…"}
                </span>{" "}
                ?
              </label>
              <input
                id="voice-cap"
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
              {submitting ? "מתחילים שיחה…" : "התקשרו אליי עכשיו"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
