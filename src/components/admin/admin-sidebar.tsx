import { Link } from "@tanstack/react-router";

import { ADMIN_NAV_ITEMS } from "./admin-nav";

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-surface-elevated p-4">
      <div className="flex items-center gap-3 px-1">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-base font-bold text-brand-foreground">
          T
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">טיפולינקס — ניהול</span>
      </div>

      <nav aria-label="ניווט ניהול" className="flex flex-1 flex-col gap-1">
        {ADMIN_NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-brand-soft font-semibold text-foreground" }}
            inactiveProps={{ className: "text-muted-foreground" }}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>

      <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
        אזור ניהול פנימי למשתמשים בעלי הרשאת מנהל בלבד.
      </p>
    </div>
  );
}
