import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpLeft } from "lucide-react";

export function AccountStatCard({
  label,
  value,
  detail,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  change?: number;
  icon: LucideIcon;
}) {
  const positive = (change ?? 0) >= 0;

  return (
    <article className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground ltr-num">{value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 flex min-h-5 items-center gap-2 text-xs">
        {typeof change === "number" && (
          <span
            className={`inline-flex items-center gap-0.5 font-semibold ${positive ? "text-emerald-700" : "text-red-700"}`}
          >
            {positive ? <ArrowUpLeft className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
            <span className="ltr-num">{Math.abs(change)}%</span>
          </span>
        )}
        {detail && <span className="text-muted-foreground">{detail}</span>}
      </div>
    </article>
  );
}
