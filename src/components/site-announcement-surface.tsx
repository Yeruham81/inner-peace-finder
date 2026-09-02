import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Info, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  dismissMySiteAnnouncement,
  getMyActiveSiteAnnouncements,
  type ActiveSiteAnnouncement,
} from "@/lib/admin-broadcast.functions";

function categoryIcon(category: ActiveSiteAnnouncement["category"]) {
  if (category === "operational") return TriangleAlert;
  if (category === "marketing") return Sparkles;
  return Info;
}

function AnnouncementAction({ announcement, compact = false }: { announcement: ActiveSiteAnnouncement; compact?: boolean }) {
  if (!announcement.ctaLabel || !announcement.ctaUrl) return null;
  return (
    <Button asChild size={compact ? "sm" : "default"} variant={compact ? "outline" : "default"} className="shrink-0">
      <a href={announcement.ctaUrl} dir="rtl">
        {announcement.ctaLabel}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </Button>
  );
}

export function SiteAnnouncementSurface() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(getMyActiveSiteAnnouncements);
  const dismissFn = useServerFn(dismissMySiteAnnouncement);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setSessionResolved(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(Boolean(session));
      setSessionResolved(true);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const announcements = useQuery({
    queryKey: ["my-site-announcements"],
    queryFn: () => listFn(),
    enabled: sessionResolved && signedIn,
    staleTime: 60_000,
  });

  const dismissMutation = useMutation({
    mutationFn: (announcementId: string) => dismissFn({ data: { announcementId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-site-announcements"] });
    },
  });

  const banners = useMemo(
    () => (announcements.data ?? []).filter((announcement) => announcement.displayType === "banner"),
    [announcements.data],
  );
  const modal = useMemo(
    () => (announcements.data ?? []).find((announcement) => announcement.displayType === "modal") ?? null,
    [announcements.data],
  );

  if (!signedIn || (!modal && banners.length === 0)) return null;

  return (
    <>
      {banners.length > 0 && (
        <div className="border-b border-border bg-brand-soft/70" dir="rtl" aria-label="הודעות מערכת">
          <div className="mx-auto max-w-7xl divide-y divide-border/60">
            {banners.map((announcement) => {
              const Icon = categoryIcon(announcement.category);
              return (
                <div
                  key={announcement.id}
                  className="flex flex-col gap-3 px-4 py-3 text-right sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  dir="rtl"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{announcement.title}</p>
                      <p className="mt-0.5 whitespace-pre-line text-sm leading-6 text-muted-foreground">{announcement.body}</p>
                    </div>
                  </div>
                  <AnnouncementAction announcement={announcement} compact />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(modal)}
        onOpenChange={(open) => {
          if (!open && modal && !dismissMutation.isPending) dismissMutation.mutate(modal.id);
        }}
      >
        {modal && (
          <DialogContent className="max-w-lg text-right" dir="rtl">
            <DialogHeader className="text-right" dir="rtl">
              <DialogTitle className="text-right">{modal.title}</DialogTitle>
              <DialogDescription asChild>
                <div className="whitespace-pre-line pt-2 text-right text-sm leading-7 text-muted-foreground" dir="rtl">
                  {modal.body}
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-start pt-2" dir="rtl">
              <AnnouncementAction announcement={modal} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
