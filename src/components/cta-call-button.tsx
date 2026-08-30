import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { track } from "@/lib/analytics";
import type { PublicContactMethod } from "@/lib/public-therapist-profile";
import { LeadModal } from "@/components/lead-modal";
import { VoiceCallModal } from "@/components/voice-call-modal";
import { WhatsAppLeadModal } from "@/components/whatsapp-lead-modal";

type SharedContactProps = {
  therapistId: string;
  therapistName: string;
  sourceProblemId?: string | null;
  sourceProblemName?: string | null;
  populationId?: string | null;
  populationName?: string | null;
  pageSource?: string | null;
};

type ContactActionsProps = SharedContactProps & {
  contactMethods: PublicContactMethod[];
  preferredContactMethod?: PublicContactMethod | null;
  interactive?: boolean;
  unclaimedProfile?: boolean;
};

const CONTACT_LABELS: Record<PublicContactMethod, string> = {
  whatsapp: "שליחת הודעה ב־WhatsApp",
  phone: "שיחה טלפונית",
  email: "שליחת פנייה באימייל",
};

function ContactIcon({ method, className = "h-4 w-4" }: { method: PublicContactMethod; className?: string }) {
  if (method === "phone") return <Phone className={className} aria-hidden />;
  if (method === "email") return <Mail className={className} aria-hidden />;
  return <MessageCircle className={className} aria-hidden />;
}

function orderedContactMethods(
  methods: readonly PublicContactMethod[],
  preferred: PublicContactMethod | null | undefined,
): PublicContactMethod[] {
  const unique = [...new Set(methods)].slice(0, 3);
  if (!preferred || !unique.includes(preferred)) return unique;
  return [preferred, ...unique.filter((method) => method !== preferred)];
}

function ContactButtons({
  methods,
  preferred,
  disabled,
  pendingMethod,
  onSelect,
  unclaimedProfile = false,
}: {
  methods: PublicContactMethod[];
  preferred: PublicContactMethod | null | undefined;
  disabled: boolean;
  pendingMethod: PublicContactMethod | null;
  onSelect: (method: PublicContactMethod) => void;
  unclaimedProfile?: boolean;
}) {
  const ordered = orderedContactMethods(methods, preferred);

  if (ordered.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {ordered.map((method, index) => {
        const primary = index === 0;
        const pending = pendingMethod === method;

        return (
          <button
            key={method}
            type="button"
            disabled={disabled || pending}
            aria-disabled={disabled || pending}
            onClick={() => onSelect(method)}
            className={
              primary
                ? "inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-foreground shadow-soft transition-all hover:bg-primary active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                : "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-brand/50 hover:bg-brand-soft/40 disabled:cursor-not-allowed disabled:opacity-65"
            }
          >
            <ContactIcon method={method} className={primary ? "h-5 w-5" : "h-4 w-4"} />
            <span>
              {pending
                ? "פותח…"
                : unclaimedProfile && method === "email"
                  ? "שליחת פנייה ראשונית"
                  : CONTACT_LABELS[method]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Public-profile contact actions.
 *
 * Only availability metadata reaches the public DTO. For direct phone/WhatsApp
 * actions the actual phone number is released only after a protected, non-billable
 * server action re-checks public eligibility and method availability.
 */
export function ContactActions(props: ContactActionsProps) {
  // An unclaimed admin-created profile may accept only the single held form
  // inquiry. Never render phone/WhatsApp actions that cannot be released until
  // ownership is accepted; the server function enforces the same boundary.
  const methods: PublicContactMethod[] = props.unclaimedProfile
    ? ["email"]
    : orderedContactMethods(props.contactMethods, props.preferredContactMethod);

  if (props.interactive === false) {
    return (
      <ContactButtons
        methods={methods}
        preferred={props.preferredContactMethod}
        disabled
        pendingMethod={null}
        onSelect={() => undefined}
        unclaimedProfile={props.unclaimedProfile}
      />
    );
  }

  return <InteractiveContactActions {...props} contactMethods={methods} />;
}

function InteractiveContactActions({
  therapistId,
  therapistName,
  contactMethods,
  preferredContactMethod,
  sourceProblemId,
  sourceProblemName,
  populationId,
  populationName,
  pageSource,
  unclaimedProfile = false,
}: ContactActionsProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const shownFiredRef = useRef(false);
  const methods = orderedContactMethods(contactMethods, preferredContactMethod);

  useEffect(() => {
    if (shownFiredRef.current || methods.length === 0) return;
    shownFiredRef.current = true;
    track("cta_shown", {
      therapist_id: therapistId,
      problem_id: sourceProblemId ?? null,
      page_source: pageSource ?? null,
      origin: "ContactActions",
    });
  }, [methods.length, pageSource, sourceProblemId, therapistId]);

  function handleSelect(method: PublicContactMethod) {
    track("cta_clicked", {
      therapist_id: therapistId,
      problem_id: sourceProblemId ?? null,
      page_source: pageSource ?? null,
      origin: "ContactActions",
    });

    if (method === "email") {
      setEmailOpen(true);
      return;
    }

    // A phone request never exposes a number to the browser: the platform calls
    // the visitor first and bridges the therapist leg server-side.
    if (method === "phone") {
      setCallOpen(true);
      return;
    }

    // WhatsApp keeps the visitor inside Tipulinks: the message is created here
    // and sent to the therapist server-side. No number reaches the browser.
    setWhatsappOpen(true);
  }

  return (
    <>
      <ContactButtons
        methods={methods}
        preferred={preferredContactMethod}
        disabled={false}
        pendingMethod={null}
        onSelect={handleSelect}
        unclaimedProfile={unclaimedProfile}
      />

      {contactMethods.includes("phone") && (
        <VoiceCallModal
          open={callOpen}
          onClose={() => setCallOpen(false)}
          therapistId={therapistId}
          therapistName={therapistName}
          pageSource={pageSource ?? null}
        />
      )}

      {contactMethods.includes("whatsapp") && (
        <WhatsAppLeadModal
          open={whatsappOpen}
          onClose={() => setWhatsappOpen(false)}
          therapistId={therapistId}
          therapistName={therapistName}
          problemId={sourceProblemId ?? null}
          problemName={sourceProblemName ?? null}
          populationId={populationId ?? null}
          populationName={populationName ?? null}
          pageSource={pageSource ?? null}
        />
      )}

      {contactMethods.includes("email") && (
        <LeadModal
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          therapistId={therapistId}
          therapistName={therapistName}
          problemId={sourceProblemId ?? null}
          problemName={sourceProblemName ?? null}
          populationId={populationId ?? null}
          populationName={populationName ?? null}
          pageSource={pageSource ?? undefined}
          unclaimedProfile={unclaimedProfile}
        />
      )}
    </>
  );
}

/**
 * Backward-compatible generic lead button used by any surface that has not yet
 * migrated to the multi-method public-profile controls.
 */
export function CtaCallButton({
  therapistId,
  therapistName,
  sourceProblemId,
  sourceProblemName,
  populationId,
  populationName,
  pageSource,
}: SharedContactProps) {
  const [open, setOpen] = useState(false);
  const shownFiredRef = useRef(false);

  useEffect(() => {
    if (shownFiredRef.current) return;
    shownFiredRef.current = true;
    track("cta_shown", {
      therapist_id: therapistId,
      problem_id: sourceProblemId ?? null,
      page_source: pageSource ?? null,
      origin: "CtaCallButton",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapistId]);

  function handleClick() {
    track("cta_clicked", {
      therapist_id: therapistId,
      problem_id: sourceProblemId ?? null,
      page_source: pageSource ?? null,
      origin: "CtaCallButton",
    });
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-foreground shadow-soft transition-all hover:bg-primary active:scale-[0.99]"
      >
        <span aria-hidden>✉️</span>
        <span>שליחת פנייה</span>
      </button>
      <LeadModal
        open={open}
        onClose={() => setOpen(false)}
        therapistId={therapistId}
        therapistName={therapistName}
        problemId={sourceProblemId ?? null}
        problemName={sourceProblemName ?? null}
        populationId={populationId ?? null}
        populationName={populationName ?? null}
        pageSource={pageSource ?? undefined}
      />
    </>
  );
}
