import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";

import { AdminSidebar } from "./admin-sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AdminHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-elevated/90 backdrop-blur">
      <div className="flex min-h-14 items-center gap-2 px-3 sm:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="פתיחת תפריט ניהול">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetTitle className="sr-only">תפריט ניהול</SheetTitle>
            <AdminSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <span className="text-sm font-semibold text-foreground">מערכת הניהול</span>

        <div className="ms-auto">
          <Link to="/" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            חזרה לאתר
          </Link>
        </div>
      </div>
    </header>
  );
}