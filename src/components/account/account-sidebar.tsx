import { Link } from "@tanstack/react-router";

import { ACCOUNT_NAV_ITEMS } from "./account-nav";

export function AccountSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-surface-elevated p-4">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-3 px-1">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-lg font-bold text-brand-foreground">
          T
        </span>
        <span>
          <span className="block text-sm font-bold tracking-tight text-foreground">טיפולינקס</span>
          <span className="block text-xs text-muted-foreground">אזור המטפל/ת</span>
        </span>
      </Link>

      <nav aria-label="ניווט החשבון" className="flex flex-1 flex-col gap-1">
        {ACCOUNT_NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            onClick={onNavigate}
            className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-brand-soft font-semibold text-foreground" }}
            inactiveProps={{ className: "text-muted-foreground" }}
          >
            <item.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-sm">{item.label}</span>
              <span className="mt-0.5 hidden text-[11px] font-normal leading-4 text-muted-foreground xl:block">
                {item.description}
              </span>
            </span>
          </Link>
        ))}
      </nav>

      <div className="rounded-xl border border-brand/20 bg-brand-soft/35 p-3">
        <p className="text-xs font-semibold text-foreground">צריכים לעדכן משהו בפרופיל?</p>
        <Link
          to="/account/profile"
          search={{ therapistId: undefined }}
          onClick={onNavigate}
          className="mt-1 inline-block text-xs font-medium text-brand underline-offset-4 hover:underline"
        >
          מעבר לעריכת הפרופיל
        </Link>
      </div>
    </div>
  );
}
