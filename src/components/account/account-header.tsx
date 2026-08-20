import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LogOut, Menu } from "lucide-react";
import { useState } from "react";

import { AccountSidebar } from "./account-sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

export function AccountHeader() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-elevated/90 backdrop-blur">
      <div className="flex min-h-14 items-center gap-2 px-3 sm:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="פתיחת תפריט החשבון">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetTitle className="sr-only">תפריט החשבון</SheetTitle>
            <AccountSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <span className="text-sm font-semibold text-foreground">החשבון שלי</span>

        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              חזרה לאתר
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5 text-muted-foreground">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">יציאה</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
