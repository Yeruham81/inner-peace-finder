import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AdminPageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <nav aria-label="נתיב ניווט" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/admin" className="underline-offset-4 hover:underline">
            ניהול
          </Link>
          {breadcrumb ? (
            <>
              <span aria-hidden="true">/</span>
              <span className="text-foreground">{breadcrumb}</span>
            </>
          ) : null}
        </nav>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}