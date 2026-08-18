import type { ReactNode } from "react";

import { AdminHeader } from "./admin-header";
import { AdminSidebar } from "./admin-sidebar";

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-surface">
      <div className="mx-auto flex w-full max-w-[1400px]">
        <aside className="hidden w-64 shrink-0 border-s border-border lg:sticky lg:top-0 lg:block lg:h-screen">
          <AdminSidebar />
        </aside>

        <div className="min-w-0 flex-1 border-border lg:border-e">
          <AdminHeader />
          <div className="px-3 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}