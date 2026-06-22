import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordCtaClick } from "@/lib/therapists.functions";
import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function CtaCallButton({
  therapistId,
  sourceProblemId,
  fallbackPhone,
  pageSource,
}: {
  therapistId: string;
  sourceProblemId?: string | null;
  fallbackPhone?: string | null;
  pageSource?: string | null;
}) {
  const record = useServerFn(recordCtaClick);
  const [phone, setPhone] = useState<string | null>(fallbackPhone ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    track("cta_shown", {
      therapist_id: therapistId,
      problem_id: sourceProblemId ?? null,
      page_source: pageSource ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapistId]);

  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (loading) return;
    setLoading(true);
    track("cta_clicked", {
      therapist_id: therapistId,
      problem_id: sourceProblemId ?? null,
      page_source: pageSource ?? null,
    });
    try {
      const res = await record({
        data: { therapistId, sourceProblemId: sourceProblemId ?? null },
      });
      if (res?.phone) setPhone(res.phone);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
    // navigation happens via anchor href to tel:
    if (!phone && !fallbackPhone) {
      e.preventDefault();
    }
  }

  const tel = phone ?? fallbackPhone ?? "";
  return (
    <a
      href={tel ? `tel:${tel.replace(/[^0-9+]/g, "")}` : "#"}
      onClick={handleClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-foreground shadow-soft transition-all hover:bg-primary active:scale-[0.99] sm:w-auto"
    >
      <span aria-hidden>📞</span>
      <span>התקשר למטפל</span>
      {tel && <span className="ltr-num text-sm font-normal opacity-90">{tel}</span>}
    </a>
  );
}