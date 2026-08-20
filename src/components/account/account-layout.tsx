import type { ReactNode } from "react";

import { AccountHeader } from "./account-header";
import { AccountSidebar } from "./account-sidebar";

export function AccountLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-brand-soft/30 via-background to-background">
      <div className="mx-auto flex w-full max-w-[1500px]">
        <aside className="hidden w-64 shrink-0 border-s border-border lg:sticky lg:top-0 lg:block lg:h-screen">
          <AccountSidebar />
        </aside>

        <div className="min-w-0 flex-1 border-border lg:border-e">
          <AccountHeader />
          <div className="px-3 py-6 sm:px-6 sm:py-8">
            <div className={`mx-auto w-full ${wide ? "max-w-6xl" : "max-w-5xl"}`}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
