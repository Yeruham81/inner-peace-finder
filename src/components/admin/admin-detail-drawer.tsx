import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function AdminDetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 overflow-y-auto p-0" dir="rtl">
        <SheetHeader className="border-b border-border p-4 text-start">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {description ? <SheetDescription className="text-xs">{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 space-y-5 p-4">{children}</div>
        {footer ? <div className="sticky bottom-0 border-t border-border bg-surface-elevated p-3">{footer}</div> : null}
      </SheetContent>
    </Sheet>
  );
}

export function AdminDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1.5 rounded-md border border-border p-3">{children}</div>
    </section>
  );
}

export function AdminDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium text-foreground">{value}</span>
    </div>
  );
}
