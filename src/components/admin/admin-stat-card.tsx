import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function AdminStatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-start gap-3 p-4">
        {Icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-soft text-foreground">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none text-foreground">{value}</p>
          {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}