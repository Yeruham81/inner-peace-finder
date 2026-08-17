import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { LeadModal } from "@/components/lead-modal";

export function CtaCallButton({
  therapistId,
  therapistName,
  sourceProblemId,
  sourceProblemName,
  populationId,
  populationName,
  pageSource,
}: {
  therapistId: string;
  therapistName: string;
  sourceProblemId?: string | null;
  sourceProblemName?: string | null;
  populationId?: string | null;
  populationName?: string | null;
  pageSource?: string | null;
}) {
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
